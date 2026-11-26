/* SnowFX Extreme – HDR render pipeline.
   scene (HDR, MSAA) -> GTAO + contact shadows (half res) -> volumetrics (reduced res) -> lit (a = linear depth)
   -> bloom mips -> final (motion blur, DoF, bloom, exposure, ACES, LUT, vignette, grain, dither) -> FXAA/SMAA.
   Tone mapping and sRGB encoding happen exactly once, in the final pass. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};
  const VS = 'varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }';
  const DEPTH = `uniform sampler2D tDepth; uniform vec2 uNF; uniform vec2 uTan;
    float linZ(vec2 uv){ float d=texture2D(tDepth,uv).r; return uNF.x*uNF.y/(uNF.y-d*(uNF.y-uNF.x)); }
    vec3 vpos(vec2 uv,float z){ return vec3((uv*2.-1.)*uTan*z,-z); }
    float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }`;

  NS.createPipeline = ({ THREE, renderer, scene, camera, SMAAPass, noiseTex, isIOS, isTouch, moon, lamps }) => {
    const HF = THREE.HalfFloatType, gl = renderer.getContext();
    const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scn = new THREE.Scene();
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false; scn.add(quad);
    const rt = (w, h, o = {}) => { const t = new THREE.WebGLRenderTarget(w, h, Object.assign({ type: HF, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }, o)); t.texture.generateMipmaps = false; return t; };
    const mat = (fs, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
    const U = v => ({ value: v }), V2 = (x = 1, y = 1) => new THREE.Vector2(x, y);
    const sh = { tDepth: U(null), uNF: U(V2(.1, 1700)), uTan: U(V2()), uTime: U(0) };

    /* ---- GTAO + contact shadows ---- */
    const aoM = mat(`varying vec2 vUv; ${DEPTH}
      uniform vec2 uTexel; uniform float uR,uProj; uniform vec3 uL; uniform float uCon;
      vec3 vN(vec2 uv,vec3 P,float z){ vec2 t=uTexel;
        float zl=linZ(uv-vec2(t.x,0.)),zr=linZ(uv+vec2(t.x,0.)),zd=linZ(uv-vec2(0.,t.y)),zu=linZ(uv+vec2(0.,t.y));
        vec3 dx=abs(zl-z)<abs(zr-z)?P-vpos(uv-vec2(t.x,0.),zl):vpos(uv+vec2(t.x,0.),zr)-P;
        vec3 dy=abs(zd-z)<abs(zu-z)?P-vpos(uv-vec2(0.,t.y),zd):vpos(uv+vec2(0.,t.y),zu)-P;
        return normalize(cross(dx,dy)); }
      vec2 snapUv(vec2 uv){ return (floor(uv/uTexel)+.5)*uTexel; }
      void main(){ vec2 vUv0=snapUv(vUv);
        float z=linZ(vUv0); if(z>160.){ gl_FragColor=vec4(1.); return; }
        vec3 P=vpos(vUv0,z),V=normalize(-P),N=vN(vUv0,P,z); P+=N*(.004+z*.0022);
        float n0=ign(gl_FragCoord.xy), n1=fract(n0*7.31+.37);
        float rp=clamp(uR*uProj/z,.004,.11); float vis=0.;
        for(int s=0;s<SLICES;s++){
          float phi=(float(s)+n0)*3.14159265/float(SLICES); vec2 om=vec2(cos(phi),sin(phi));
          vec3 dir=vec3(om,0.), ortho=dir-dot(dir,V)*V, ax=normalize(cross(dir,V)), pn=N-ax*dot(N,ax); float ln=max(length(pn),1e-4);
          float sg=sign(dot(ortho,pn)), cn=clamp(dot(pn,V)/ln,0.,1.), nn=sg*acos(cn); vec2 hz=vec2(-1.);
          for(int k=0;k<STEPS;k++){ float t=(float(k)+n1)/float(STEPS); t*=t; vec2 o=om*(t*rp+uTexel.x*1.5); o.y*=uTan.x/uTan.y;
            for(int e=0;e<2;e++){ vec2 q=snapUv(vUv0+(e==0?o:-o)); if(q.x<0.||q.y<0.||q.x>1.||q.y>1.) continue;
              vec3 d=vpos(q,linZ(q))-P; float l=length(d); float c=mix(-1.,dot(d/max(l,1e-4),V),clamp(1.6-l/uR*1.6,0.,1.));
              if(e==0) hz.x=max(hz.x,c); else hz.y=max(hz.y,c); } }
          float h0=-acos(clamp(hz.y,-1.,1.)), h1=acos(clamp(hz.x,-1.,1.)); float hp=1.5707963;
          h0=nn+max(h0-nn,-hp); h1=nn+min(h1-nn,hp);
          vis+=ln*.25*((cn+2.*h0*sin(nn)-cos(2.*h0-nn))+(cn+2.*h1*sin(nn)-cos(2.*h1-nn))); }
        vis=clamp(vis/float(SLICES),0.,1.); vis=mix(vis,1.,smoothstep(90.,160.,z));
        float con=1.;
        if(uCon>.5&&z<45.){ float NL=dot(N,uL); if(NL>.02){ float len=mix(.35,.9,clamp(z/30.,0.,1.));
          for(int k=0;k<10;k++){ vec3 q=P+uL*len*(float(k)+.4+n0*.6)/10.; vec2 uv=snapUv(q.xy/(-q.z*uTan)*.5+.5); if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) break;
            float dz=-q.z-linZ(uv); if(dz>.018+z*.0035&&dz<.35){ con=min(con,float(k)/10.*.6); break; } } con=mix(con,1.,smoothstep(25.,45.,z)); } }
        gl_FragColor=vec4(vis,con,0.,1.); }`, Object.assign({ uTexel: U(V2()), uR: U(1.25), uProj: U(1), uL: U(new THREE.Vector3(0, 1, 0)), uCon: U(1) }, sh), { SLICES: 2, STEPS: 4 });
    const blurM = mat(`varying vec2 vUv; ${DEPTH} uniform sampler2D tA; uniform vec2 uDir;
      void main(){ float z=linZ(vUv); vec4 s=texture2D(tA,vUv); float w=1.;
        for(int i=1;i<=3;i++) for(int e=0;e<2;e++){ vec2 q=vUv+uDir*float(i)*(e==0?1.:-1.); float k=exp(-float(i*i)*.22)*max(0.,1.-abs(linZ(q)-z)/(z*.02+.06)); s+=texture2D(tA,q)*k; w+=k; }
        gl_FragColor=s/w; }`, Object.assign({ tA: U(null), uDir: U(V2()) }, sh));

    /* ---- volumetric light: analytic glow round the lamps, moon shafts through the shadow map, ground mist ---- */
    const volM = mat(`varying vec2 vUv; ${DEPTH}
      uniform mat4 uCamW,uSM; uniform sampler2D tShadow; uniform sampler2D tNoise; uniform vec3 uCam,uMoonV,uMoonC,uMistC,uFogC; uniform vec3 uLp[NL],uLc[NL];
      uniform float uTime,uDens,uMist,uHasSh,uShaft,uLampK; uniform vec4 uGnd; uniform vec3 uWind;
      const vec4 UPK=vec4(1./(256.*256.*256.),1./(256.*256.),1./256.,1.)*(255./256.);
      float lit(vec3 p){ vec4 c=uSM*vec4(p,1.); c.xyz/=c.w; if(c.x<0.||c.y<0.||c.x>1.||c.y>1.||c.z>1.) return 1.; return step(c.z,dot(texture2D(tShadow,c.xy),UPK)); }
      float hg(float c,float g){ float g2=g*g; return (1.-g2)/pow(1.+g2-2.*g*c,1.5)*.0796; }
      float nz(vec3 p){ return texture2D(tNoise,p.xz*.031+p.y*.017).r*.6+texture2D(tNoise,p.xz*.083+vec2(p.y*.04,.3)).r*.4; }
      void main(){
        float z=linZ(vUv); vec3 vd=vec3((vUv*2.-1.)*uTan,-1.); float vl=length(vd); vec3 rd=mat3(uCamW)*(vd/vl);
        float D=min(z*vl,170.); float jit=ign(gl_FragCoord.xy+vec2(5.3,1.7)); vec3 sc=vec3(0.); float tr=1.;
        // lamps: the in-scatter integral of a point light along the ray has a closed form
        for(int i=0;i<NL;i++){ vec3 q=uCam-uLp[i]; float b=dot(rd,q), c=dot(q,q), s=1./sqrt(max(c-b*b,.05)); float a=s*(atan((D+b)*s)-atan(b*s)); 
          float near=1./(1.+max(c-b*b,0.)*.10); sc+=uLc[i]*a*near*uLampK; }
        #if STEPS>0
        { float T=min(D,uHasSh>.5?58.:40.); float ph=hg(dot(rd,uMoonV),.62)+.018; float acc=0.,mst=0.; float dt=T/float(STEPS);
          for(int i=0;i<STEPS;i++){ float t=(float(i)+jit)*dt; vec3 p=uCam+rd*t; float h=p.y-(uGnd.x+(p.z-uGnd.y)*uGnd.z);
            float n=nz(p+uWind*uTime); float den=exp(-max(h,0.)*.16)*.8+.35; den*=.45+n*1.1;
            float s=uHasSh>.5?lit(p):1.; acc+=s*den*dt; 
            float m=exp(-max(h+.3,0.)*1.05)*smoothstep(.38,.75,n)*smoothstep(2.,9.,t); mst+=m*dt; }
          sc+=uMoonC*ph*acc*uShaft; float ma=1.-exp(-mst*uMist*.05); sc+=uMistC*ma; tr*=1.-ma*.75; }
        #endif
        gl_FragColor=vec4(sc*uDens,tr); }`, Object.assign({ uCamW: U(camera.matrixWorld), uSM: U(new THREE.Matrix4()), tShadow: U(null), tNoise: U(noiseTex), uCam: U(camera.position), uMoonV: U(new THREE.Vector3()), uMoonC: U(new THREE.Color()), uMistC: U(new THREE.Color()), uFogC: U(new THREE.Color()),
      uLp: U(lamps.map(() => new THREE.Vector3(0, -1e4, 0))), uLc: U(lamps.map(() => new THREE.Vector3())), uDens: U(1), uMist: U(1), uHasSh: U(0), uShaft: U(1), uLampK: U(.055), uGnd: U(new THREE.Vector4()), uWind: U(new THREE.Vector3(.6, 0, .25)) }, sh), { STEPS: 12, NL: lamps.length });

    /* ---- lit: scene * AO + volumetrics; alpha carries the linear depth ---- */
    const litM = mat(`varying vec2 vUv; ${DEPTH} uniform sampler2D tScene,tAO,tVol; uniform vec2 uAOT,uVolT; uniform float uAO,uVol; uniform vec3 uAOc;
      vec4 up(sampler2D t,vec2 tx,float z){ vec2 f=vUv/tx-.5, i=floor(f); f-=i; vec4 s=vec4(0.); float w=0.;
        for(int y=0;y<2;y++) for(int x=0;x<2;x++){ vec2 q=(i+vec2(x,y)+.5)*tx; float k=(x==0?1.-f.x:f.x)*(y==0?1.-f.y:f.y); k=(k+.001)*max(.0001,1.-abs(linZ(q)-z)/(z*.06+.15)); s+=texture2D(t,q)*k; w+=k; } return s/w; }
      void main(){ vec4 s=texture2D(tScene,vUv); vec3 c=s.rgb; if(any(isnan(c))||any(isinf(c))) c=vec3(0.); c=clamp(c,0.,60.); float z=linZ(vUv);
        if(uAO>.5){ vec2 a=up(tAO,uAOT,z).rg; float l=dot(c,vec3(.2126,.7152,.0722)); float keep=smoothstep(.9,2.4,l);
          float v=mix(a.r,1.,keep); c*=mix(uAOc,vec3(1.),v); c*=mix(vec3(.62,.68,.86),vec3(1.),mix(a.g,1.,keep)); }
        if(uVol>.5){ vec4 v=up(tVol,uVolT,z); c=c*v.a+v.rgb; }
        gl_FragColor=vec4(c,z); }`, Object.assign({ tScene: U(null), tAO: U(null), tVol: U(null), uAOT: U(V2()), uVolT: U(V2()), uAO: U(0), uVol: U(0), uAOc: U(new THREE.Vector3(.10, .13, .24)) }, sh));
    const copyM = mat(`varying vec2 vUv; uniform sampler2D tA; void main(){ gl_FragColor=texture2D(tA,vUv); }`, { tA: U(null) });

    /* ---- bloom: 13-tap downsample with Karis weights on the first level, tent upsample ---- */
    const downM = mat(`varying vec2 vUv; uniform sampler2D tA; uniform vec2 uT; uniform float uFirst,uTh;
      vec3 pf(vec3 c){ float b=max(c.r,max(c.g,c.b)); float k=.45, s=clamp(b-uTh+k,0.,2.*k); s=s*s/(4.*k+1e-4); return min(c,vec3(24.))*max(s,b-uTh)/max(b,1e-4); }
      vec3 g(vec2 o){ return texture2D(tA,vUv+o*uT).rgb; }
      float kw(vec3 c){ return 1./(1.+dot(c,vec3(.2126,.7152,.0722))); }
      void main(){ vec3 a=g(vec2(-2,2)),b=g(vec2(0,2)),c=g(vec2(2,2)),d=g(vec2(-2,0)),e=g(vec2(0)),f=g(vec2(2,0)),h=g(vec2(-2,-2)),i=g(vec2(0,-2)),j=g(vec2(2,-2)),k=g(vec2(-1,1)),l=g(vec2(1,1)),m=g(vec2(-1,-1)),n=g(vec2(1,-1));
        vec3 r; if(uFirst>.5){ vec3 q0=pf((a+b+d+e)*.25),q1=pf((b+c+e+f)*.25),q2=pf((d+e+h+i)*.25),q3=pf((e+f+i+j)*.25),q4=pf((k+l+m+n)*.25);
          float w0=kw(q0)*.125,w1=kw(q1)*.125,w2=kw(q2)*.125,w3=kw(q3)*.125,w4=kw(q4)*.5; r=(q0*w0+q1*w1+q2*w2+q3*w3+q4*w4)/(w0+w1+w2+w3+w4); }
        else r=e*.125+(a+c+h+j)*.03125+(b+d+f+i)*.0625+(k+l+m+n)*.125;
        if(any(isnan(r))||any(isinf(r))) r=vec3(0.); gl_FragColor=vec4(r,1.); }`, { tA: U(null), uT: U(V2()), uFirst: U(0), uTh: U(1.05) });
    const upM = mat(`varying vec2 vUv; uniform sampler2D tA,tB; uniform vec2 uT; uniform float uK;
      vec3 g(vec2 o){ return texture2D(tA,vUv+o*uT).rgb; }
      void main(){ vec3 r=g(vec2(0))*4.+(g(vec2(1,0))+g(vec2(-1,0))+g(vec2(0,1))+g(vec2(0,-1)))*2.+g(vec2(1,1))+g(vec2(-1,1))+g(vec2(1,-1))+g(vec2(-1,-1));
        gl_FragColor=vec4(mix(texture2D(tB,vUv).rgb,r/16.,uK),1.); }`, { tA: U(null), tB: U(null), uT: U(V2()), uK: U(.6) });

    /* ---- colour LUT (32^3), baked from the grade: filmic S, cold shadows / warm lights, saturation roll-off ---- */
    const LN = 32, lutData = new Uint8Array(LN * LN * LN * 4);
    { const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      let k = 0; for (let b = 0; b < LN; b++) for (let g = 0; g < LN; g++) for (let r = 0; r < LN; r++) {
        let c = [r / (LN - 1), g / (LN - 1), b / (LN - 1)]; c = c.map(v => v + (v * v * (3 - 2 * v) - v) * .2);
        let l = c[0] * .2126 + c[1] * .7152 + c[2] * .0722; const sw = 1 - ss(0, .5, l), hw = ss(.42, 1, l);
        const cool = [.90, .99, 1.10], warm = [1.07, 1.015, .92], lift = [0, .002, .0075];
        c = c.map((v, i) => (v + lift[i] * sw) * (1 + (cool[i] - 1) * sw * .75) * (1 + (warm[i] - 1) * hw * .6));
        l = c[0] * .2126 + c[1] * .7152 + c[2] * .0722; const sat = 1.14 * (1 - .32 * ss(.75, 1, l)) ;
        c = c.map(v => Math.min(1, Math.max(0, l + (v - l) * sat)));
        for (let i = 0; i < 3; i++) lutData[k++] = Math.round(c[i] * 255); lutData[k++] = 255; } }
    const lut = new THREE.Data3DTexture(lutData, LN, LN, LN); lut.format = THREE.RGBAFormat; lut.type = THREE.UnsignedByteType; lut.minFilter = lut.magFilter = THREE.LinearFilter; lut.wrapS = lut.wrapT = lut.wrapR = THREE.ClampToEdgeWrapping; lut.unpackAlignment = 1; lut.needsUpdate = true;

    const finM = mat(`varying vec2 vUv; uniform sampler2D tLit,tBloom,tNoise; uniform highp sampler3D tLut; uniform vec2 uRes,uTan; uniform mat4 uReproj;
      uniform float uTime,uSpeed,uAspect,uHit,uExp,uBloom,uMB,uDof,uDofA,uDofB,uGrade,uLens,uFrost,uVig,uFlash,uSrgb; 
      float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      vec3 aces(vec3 c){ c*=uExp/.6; c=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777)*c;
        vec3 a=c*(c+.0245786)-.000090537,b=c*(.983729*c+.4329510)+.238081; c=a/b;
        return clamp(mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602)*c,0.,1.); }
      vec3 roll(vec3 c){ float m=max(c.r,max(c.g,c.b)); if(m<=.9) return c; float mc=.9*pow(m/.9,.74); vec3 s=c*(mc/m); float d=smoothstep(.9,27.,m)*.16; return mix(s,vec3(dot(s,vec3(.2126,.7152,.0722))),d); }
      vec3 enc(vec3 c){ return mix(c*12.92,1.055*pow(max(c,1e-5),vec3(1./2.4))-.055,step(.0031308,c)); }
      void main(){
        vec2 d=vUv-.5, av=vec2(uAspect,1.); float rad=length(d*av)/(.5*length(av)); vec2 uv=vUv;
        float fr=0.; if(uFrost>.001){ float n=texture2D(tNoise,vUv*vec2(uAspect,1.)*1.3).r*.6+texture2D(tNoise,vUv*vec2(uAspect,1.)*4.1).r*.4; fr=smoothstep(.62,1.25,rad+n*.55-.28)*uFrost; uv-=(texture2D(tNoise,vUv*5.).ba-.5)*fr*.03; }
        vec4 c0=texture2D(tLit,uv); float z=c0.a; vec2 vel=vec2(0.);
        if(uMB>.001){ vec4 p=uReproj*vec4((uv*2.-1.)*uTan*z,-z,1.); vec2 q=p.xy/max(p.w,1e-4)*.5+.5; vel=(uv-q)*uMB*smoothstep(6.5,16.,z); float l=length(vel*uRes); vel*=min(1.,uRes.y*.020/max(l,1e-3))*smoothstep(.12,.62,rad); }
        vel+=d*uSpeed*.03*smoothstep(.25,1.,rad);
        float coc=uDof>.5?smoothstep(uDofA,uDofB,z)*uRes.y*.0022:0.;
        vec3 c; float vl=length(vel*uRes);
        float ca=uLens*(.0008+uSpeed*.0016)*smoothstep(.35,1.,rad);
        if(vl>.7||coc>.35){ float j=hash(gl_FragCoord.xy)-.5; vec3 s=c0.rgb; float w=1.;
          for(int i=0;i<8;i++){ float a=float(i)*2.39996+j*6.28, r=sqrt((float(i)+.5)/8.); vec2 o=vel*((float(i)+.5+j)/8.-.5)*1.+vec2(cos(a),sin(a))*r*coc/uRes; vec4 t=texture2D(tLit,uv+o); float k=(t.a>z-1.5||vl>coc)&&t.a>5.?1.:.04; s+=min(t.rgb,vec3(12.))*k; w+=k; } c=s/w; }
        else if(ca>.0004) c=vec3(texture2D(tLit,uv+d*ca).r,c0.g,texture2D(tLit,uv-d*ca).b); else c=c0.rgb;
        vec3 b=texture2D(tBloom,uv).rgb; c+=b*uBloom*(1.+uLens*.35*texture2D(tNoise,vUv*vec2(uAspect,1.)*.9+.37).g);
        c=roll(c); c=aces(c);
        vec3 e=enc(c); if(uGrade>.5){ e=texture(tLut,e*(31./32.)+.5/32.).rgb; }
        float lum=dot(e,vec3(.2126,.7152,.0722));
        e*=1.-(uVig+uSpeed*.08)*smoothstep(.3-uSpeed*.06,1.15,rad);
        e=mix(e,e*.8+vec3(.2,.235,.28),fr*.55);
        e=mix(e,vec3(.75,.1,.08),uHit*smoothstep(.25,1.,rad)*.5);
        if(uLens>.5){ float g=hash(vUv*uRes+fract(uTime*.37)*977.)-.5; e+=g*.022*(1.15-.75*lum)*smoothstep(.02,.16,lum); }
        e+=(hash(gl_FragCoord.xy+17.)+hash(gl_FragCoord.xy+91.)-1.)/255.;
        gl_FragColor=vec4(e,1.); }`, { tLit: U(null), tBloom: U(null), tNoise: U(noiseTex), tLut: U(lut), uRes: U(V2()), uTan: sh.uTan, uReproj: U(new THREE.Matrix4()), uTime: sh.uTime, uSpeed: U(0), uAspect: U(1), uHit: U(0), uExp: U(1), uBloom: U(.5), uMB: U(0), uDof: U(0), uDofA: U(70), uDofB: U(420), uGrade: U(1), uLens: U(1), uFrost: U(0), uVig: U(.34), uFlash: U(0), uSrgb: U(1) });
    const fxaaM = mat(`varying vec2 vUv; uniform sampler2D tA; uniform vec2 uT; float L(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
      void main(){ vec3 m=texture2D(tA,vUv).rgb; float lm=L(m),a=L(texture2D(tA,vUv+vec2(-1,-1)*uT).rgb),b=L(texture2D(tA,vUv+vec2(1,-1)*uT).rgb),c=L(texture2D(tA,vUv+vec2(-1,1)*uT).rgb),d=L(texture2D(tA,vUv+vec2(1,1)*uT).rgb);
        float mn=min(lm,min(min(a,b),min(c,d))),mx=max(lm,max(max(a,b),max(c,d))); if(mx-mn<max(.03,mx*.1)){ gl_FragColor=vec4(m,1.); return; }
        vec2 dir=vec2(-((a+b)-(c+d)),(a+c)-(b+d)); float rd=max((a+b+c+d)*.03125,.0078); dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+rd),-8.,8.)*uT;
        vec3 A=.5*(texture2D(tA,vUv+dir*(1./3.-.5)).rgb+texture2D(tA,vUv+dir*(2./3.-.5)).rgb), B=A*.5+.25*(texture2D(tA,vUv-dir*.5).rgb+texture2D(tA,vUv+dir*.5).rgb); float lb=L(B);
        gl_FragColor=vec4(lb<mn||lb>mx?A:B,1.); }`, { tA: U(null), uT: U(V2()) });

    const PL = { w: 0, h: 0, pr: 1, s: null, safe: 0, failed: false, rts: [], timer: null, gpuMs: null, mats: { aoM, volM, litM, finM, downM, upM }, prevTex: U(null), prevRes: V2(), active: [] };
    let T = {}, smaa = null, prevVP = new THREE.Matrix4(), prevCam = new THREE.Vector3(), prevPrev = new THREE.Matrix4(), have = false;
    const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(scn, cam2); };
    const dispose = () => { for (const k in T) { const t = T[k]; (Array.isArray(t) ? t : [t]).forEach(x => { if (x && x.depthTexture) x.depthTexture.dispose(); x && x.dispose && x.dispose(); }); } T = {}; if (smaa) { smaa.dispose && smaa.dispose(); smaa = null; } PL.prevTex.value = null; have = false; };
    PL.dispose = dispose;

    PL.configure = (w, h, pr, s) => {
      const W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr));
      const key = [W, H, s.aa, s.ao, s.vol, s.fog, s.bloom > 0, s.refl, PL.safe].join(); if (key === PL.key) { PL.s = s; return; }
      dispose(); PL.key = key; PL.w = W; PL.h = H; PL.s = s;
      const type = PL.safe ? THREE.UnsignedByteType : HF;
      const ms = s.aa >= 3 && !isIOS && !isTouch && !PL.safe ? 4 : 0;
      T.scene = rt(W, H, { depthBuffer: true, samples: ms, type }); T.scene.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType); T.scene.depthTexture.minFilter = T.scene.depthTexture.magFilter = THREE.NearestFilter;
      T.lit = rt(W, H, { minFilter: THREE.LinearFilter });
      const hw = Math.max(2, W >> 1), hh = Math.max(2, H >> 1);
      if (s.ao) { T.ao = rt(hw, hh, { type: THREE.UnsignedByteType }); T.ao2 = rt(hw, hh, { type: THREE.UnsignedByteType }); aoM.defines.SLICES = [2, 1, 2, 3][s.ao]; aoM.defines.STEPS = [3, 4, 4, 6][s.ao]; aoM.needsUpdate = true; aoM.uniforms.uTexel.value.set(1 / W, 1 / H); litM.uniforms.uAOT.value.set(1 / hw, 1 / hh); }
      if (s.vol || s.fog) { const d = s.vol >= 3 ? 2 : s.vol === 2 ? 3 : 4, vw = Math.max(2, Math.ceil(W / d)), vh = Math.max(2, Math.ceil(H / d)); T.vol = rt(vw, vh); T.vol2 = rt(vw, vh); volM.defines.STEPS = s.fog >= 2 || s.vol ? [6, 8, 14, 24][Math.max(s.vol, s.fog >= 2 ? 1 : 0)] : 0; volM.needsUpdate = true; litM.uniforms.uVolT.value.set(1 / vw, 1 / vh); }
      T.prev = [rt(hw, hh), rt(hw, hh)]; PL.prevRes.set(hw, hh); PL.pi = 0;
      if (s.bloom) { T.b = []; T.u = []; let bw = hw, bh = hh; for (let i = 0; i < 6 && bw > 6 && bh > 6; i++) { T.b.push(rt(bw, bh)); if (i) T.u.push(rt(T.b[i - 1].width, T.b[i - 1].height)); bw >>= 1; bh >>= 1; } }
      T.ldr = rt(W, H, { type: THREE.UnsignedByteType });
      if ((s.aa === 2 || s.aa === 4) && SMAAPass) { smaa = new SMAAPass(W, H); smaa.renderToScreen = true; smaa.setSize(W, H); }
      finM.uniforms.uRes.value.set(W, H); finM.uniforms.uAspect.value = W / H; fxaaM.uniforms.uT.value.set(1 / W, 1 / H);
      PL.active = ['HDR', ms ? 'MSAA 4x' : '', smaa ? 'SMAA' : s.aa === 1 ? 'FXAA' : '', s.ao ? 'GTAO' : '', s.contact && s.ao ? 'kontaktskygge' : '', s.vol ? 'volumetrisk lys' : '', s.fog ? 'tåke' : '', s.bloom ? 'bloom' : '', s.mblur ? 'bevegelsesuskarphet' : '', s.dof ? 'DoF' : '', s.grade ? 'LUT' : '', s.lens ? 'linse' : '', s.refl > 1 ? 'SSR (is)' : ''].filter(Boolean);
    };
    /* is the HDR attachment really usable on this driver? (the format may be advertised and still refused) */
    PL.probe = () => { try { renderer.setRenderTarget(T.scene); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; renderer.setRenderTarget(null); return ok; } catch (e) { return false; } };
    /* GPU time, only when the driver really offers timer queries */
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); PL.hasTimer = !!ext; const qs = []; let qf = 0;
    const tBegin = () => { if (!ext || qs.length > 3 || (qf++ & 7)) return null; const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; };
    const tEnd = q => { if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); } while (qs.length && gl.getQueryParameter(qs[0], gl.QUERY_RESULT_AVAILABLE)) { const a = qs.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(a, gl.QUERY_RESULT) / 1e6; PL.gpuMs = PL.gpuMs === null ? ms : PL.gpuMs * .8 + ms * .2; } gl.deleteQuery(a); } };

    const _lv = new THREE.Vector3(), _m = new THREE.Matrix4(), _proj = new THREE.Matrix4();
    PL.render = (env, dt) => {
      const s = PL.s, q = tBegin(), auto = renderer.info.autoReset; renderer.info.autoReset = false; renderer.info.reset();
      renderer.setRenderTarget(T.scene); renderer.clear(); renderer.render(scene, camera);
      const draws = renderer.info.render.calls, tris = renderer.info.render.triangles;
      const tanY = Math.tan(camera.fov * Math.PI / 360); sh.uTan.value.set(tanY * camera.aspect, tanY); sh.uNF.value.set(camera.near, camera.far); sh.tDepth.value = T.scene.depthTexture; sh.uTime.value = env.time;
      _m.copy(camera.matrixWorld).invert();
      if (s.ao) {
        aoM.uniforms.uProj.value = .5 / (tanY * camera.aspect); _lv.copy(env.moonDir).transformDirection(_m); aoM.uniforms.uL.value.copy(_lv); aoM.uniforms.uCon.value = s.contact ? 1 : 0;
        pass(aoM, T.ao);
        blurM.uniforms.tA.value = T.ao.texture; blurM.uniforms.uDir.value.set(1 / T.ao.width, 0); pass(blurM, T.ao2);
        blurM.uniforms.tA.value = T.ao2.texture; blurM.uniforms.uDir.value.set(0, 1 / T.ao.height); pass(blurM, T.ao);
      }
      if (T.vol) {
        const u = volM.uniforms, shm = moon.castShadow && moon.shadow.map; u.uHasSh.value = shm && s.vol ? 1 : 0; if (shm) { u.tShadow.value = moon.shadow.map.texture; u.uSM.value.copy(moon.shadow.matrix); }
        u.uShaft.value = s.vol ? env.shaft : 0; u.uLampK.value = s.vol ? .055 * env.lampK : .02 * env.lampK; u.uMist.value = s.fog ? env.mist * (s.fog > 1 ? 1 : .5) : 0; u.uMoonV.value.copy(env.moonDir); u.uMoonC.value.copy(env.moonCol); u.uMistC.value.copy(env.mistCol); u.uGnd.value.copy(env.ground); u.uDens.value = env.dens;
        for (let i = 0; i < lamps.length; i++) { const l = lamps[i]; u.uLp.value[i].copy(l.position); u.uLc.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(Math.min(l.intensity, 70) / 62); }
        pass(volM, T.vol);
        blurM.uniforms.tA.value = T.vol.texture; blurM.uniforms.uDir.value.set(1 / T.vol.width, 0); pass(blurM, T.vol2);
        blurM.uniforms.tA.value = T.vol2.texture; blurM.uniforms.uDir.value.set(0, 1 / T.vol.height); pass(blurM, T.vol);
      }
      litM.uniforms.tScene.value = T.scene.texture; litM.uniforms.uAO.value = s.ao ? 1 : 0; litM.uniforms.tAO.value = T.ao ? T.ao.texture : null; litM.uniforms.uVol.value = T.vol ? 1 : 0; litM.uniforms.tVol.value = T.vol ? T.vol.texture : null;
      pass(litM, T.lit);
      const pr = T.prev[PL.pi]; copyM.uniforms.tA.value = T.lit.texture; pass(copyM, pr); PL.prevTex.value = pr.texture; PL.pi ^= 1;   // last frame, for ice reflections and soft particles
      if (T.b) {
        const n = T.b.length; downM.uniforms.uTh.value = PL.safe ? .75 : 1.05;
        for (let i = 0; i < n; i++) { const src = i ? T.b[i - 1] : T.lit; downM.uniforms.tA.value = src.texture; downM.uniforms.uT.value.set(1 / src.width, 1 / src.height); downM.uniforms.uFirst.value = i ? 0 : 1; pass(downM, T.b[i]); }
        let low = T.b[n - 1]; for (let i = n - 2; i >= 0; i--) { upM.uniforms.tA.value = low.texture; upM.uniforms.tB.value = T.b[i].texture; upM.uniforms.uT.value.set(1 / low.width, 1 / low.height); upM.uniforms.uK.value = i ? .62 : .55; pass(upM, T.u[i]); low = T.u[i]; }
        finM.uniforms.tBloom.value = low.texture;
      }
      const f = finM.uniforms; f.tLit.value = T.lit.texture; f.uBloom.value = T.b ? s.bloom * env.bloom : 0; f.uExp.value = env.exposure; f.uGrade.value = s.grade; f.uLens.value = s.lens; f.uFrost.value = s.lens ? env.frost : 0; f.uVig.value = env.vig; f.uSpeed.value = env.speed * (s.mblur > 0 ? 1 : .25); f.uHit.value = env.hit;
      f.uDof.value = s.dof && env.dof ? 1 : 0; f.uDofA.value = env.dofA; f.uDofB.value = env.dofB;
      _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const jump = prevCam.distanceToSquared(camera.position) > 400; 
      f.uMB.value = s.mblur && have && !jump && dt > 0 ? s.mblur * .24 * Math.min(1.5, (1 / 60) / Math.max(dt, .004)) : 0;
      f.uReproj.value.copy(prevVP).multiply(camera.matrixWorld); prevVP.copy(_proj); prevCam.copy(camera.position); have = true;
      const post = smaa || s.aa === 1;
      pass(finM, post ? T.ldr : null);
      if (smaa) { smaa.renderToScreen = true; smaa.render(renderer, null, T.ldr); } else if (s.aa === 1) { fxaaM.uniforms.tA.value = T.ldr.texture; pass(fxaaM, null); }
      renderer.setRenderTarget(null); renderer.info.autoReset = auto; PL.stats = { draws, tris, allDraws: renderer.info.render.calls }; tEnd(q);
    };
    PL.cut = () => { have = false; };
    PL.memory = () => { let b = 0; const add = t => { if (!t) return; const px = t.width * t.height, bpp = t.texture.type === HF ? 8 : 4; b += px * bpp + (t.samples ? px * t.samples * (bpp + 4) : 0) + (t.depthTexture ? px * 4 : 0); }; for (const k in T) (Array.isArray(T[k]) ? T[k] : [T[k]]).forEach(add); return b; };
    return PL;
  };
})();
