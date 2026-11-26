/* SnowFX Extreme – snow and ice materials, snow deformation map. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};

  NS.GLSL_NOISE = `
    vec3 sfxH33(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
    float sfxSpark(vec2 q,vec3 n,vec3 V,vec3 L,float fp){
      float lv=clamp(log2(1./(fp*3.6)),1.5,7.), fl=floor(lv), bl=lv-fl, r=0.;
      for(int k=0;k<2;k++){ float s=exp2(fl+float(k)); vec2 g=q*s, c=floor(g); vec3 h=sfxH33(vec3(c,s)); vec2 o=g-c-(.25+.5*h.xy); float m=smoothstep(.24,.06,length(o));
        vec3 fn=normalize(n+(sfxH33(vec3(c.yx+17.3,s))-.5)*1.7); r+=(k==0?1.-bl:bl)*m*pow(max(dot(fn,normalize(V+L)),0.),190.); }
      return r; }`;
  /* screen-space reflection for ice: marches last frame's depth (alpha of the half-res history) */
  NS.GLSL_SSR = `uniform sampler2D uPrev; uniform mat4 uPM; uniform float uPrevOn;
    vec4 sfxSSR(vec3 P,vec3 N,float jit){ if(uPrevOn<.5) return vec4(0.); vec3 R=reflect(normalize(P),N); if(R.z>.35) return vec4(0.); float t=.35+jit*.25; 
      for(int i=0;i<18;i++){ vec3 q=P+R*t; vec4 c=uPM*vec4(q,1.); vec2 uv=c.xy/c.w*.5+.5; if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.||c.w<0.) break; vec4 s=texture2D(uPrev,uv); float dz=-q.z-s.a;
        if(dz>.02&&dz<.6+t*.22){ vec2 e=smoothstep(vec2(0.),vec2(.12),uv)*smoothstep(vec2(0.),vec2(.12),1.-uv); return vec4(min(s.rgb,vec3(6.)),e.x*e.y*(1.-smoothstep(20.,42.,t))); } t*=1.23; t+=.08; }
      return vec4(0.); }`;

  NS.createSnow = ({ THREE, renderer, noiseTex, snowU, pipe }) => {
    const SN = { q: 2, on: false, wind: new THREE.Vector2(1, .4) };
    const U = SN.U = { uNz: { value: noiseTex }, uKeyD: { value: new THREE.Vector3(-.33, .71, -.62) }, uKeyC: { value: new THREE.Color(1, 1, 1) }, uSkyC: { value: new THREE.Color(.3, .4, .8) }, uLampP: snowU.uLamps, uDef: { value: null }, uDefZ: { value: new THREE.Vector3(0, 0, 0) }, uDefT: { value: new THREE.Vector2(1 / 1024, 1 / 2048) }, uFresh: { value: .5 }, uPrev: pipe.prevTex, uPM: { value: new THREE.Matrix4() }, uPrevOn: { value: 0 }, uT: { value: 0 } };

    /* ---- terrain snow ---- */
    SN.compile = (sh, o) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute vec3 aSn; varying vec3 vSn,vWN,vWP;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vSn=aSn; vWN=mat3(modelMatrix)*objectNormal;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = `#define SQ ${SN.q}
        uniform sampler2D uNz,uDef; uniform vec3 uKeyD,uKeyC,uSkyC,uDefZ; uniform vec2 uDefT; uniform vec3 uLampP[5]; uniform float uFresh,uT; varying vec3 vSn,vWN,vWP;
        ${SN.q > 1 ? NS.GLSL_SSR : ''} ${NS.GLSL_NOISE}
        vec4 sfxT(vec2 p){ return texture2D(uNz,p); }
        vec2 gAx,gAy,gBx,gBy,gA,gB; float gS;
        vec4 sfxG(mat2 m,float s,float o){ vec4 r; if(gS<.99) r=textureGrad(uNz,m*gA*s+o,m*gAx*s,m*gAy*s); if(gS>.01){ vec4 k=textureGrad(uNz,m*gB*s+o,m*gBx*s,m*gBy*s); r=gS<.99?mix(r,k,gS):k; } return r; }
        float sfxIce,sfxCav,sfxTrk,sfxRock; vec3 sfxN; vec2 sfxQ;\n` + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn=normalize(vWN); float dist=length(vWP-cameraPosition); float u=vSn.x, hw=vSn.y; sfxIce=clamp(vSn.z,0.,1.); sfxTrk=0.; sfxRock=0.;
          float stx=smoothstep(.55,.8,abs(wn.x)); vec2 q=abs(wn.x)>.68?vec2(vWP.y,vWP.z):vWP.xz; sfxQ=vWP.xz+vec2(vWP.y*sign(wn.x),0.)*1.2;
          vec2 qa=vWP.xz, qb=vec2(vWP.y,vWP.z); mat2 m1=mat2(.80,-.60,.60,.80), m2=mat2(.28,.96,-.96,.28);
          mat2 m0=mat2(1.); gA=qa; gB=qb; gAx=dFdx(qa); gAy=dFdy(qa); gBx=dFdx(qb); gBy=dFdy(qb); gS=stx; vec4 a=sfxG(m0,.043,0.), b=sfxG(m1,.17,0.), c=sfxG(m2,.83,0.);
          #ifdef SNOW_FREE
          float onP=0.;
          #else
          float onP=1.-smoothstep(hw-1.,hw+.9,abs(u)+(b.r-.5)*2.2);
          #endif
          float off=1.-onP; vec2 sl=vec2(0.);
          sl+=(a.ba-.5)*mix(.10,.55,off)+(b.ba-.5)*mix(.16,.62,off)+(c.ba-.5)*mix(.20,.42,off);
          #if SQ>1
          vec4 f=sfxG(m0,3.1,.37), gq=dist<22.?sfxG(m0,9.7,0.):vec4(.5); q=qa; sl+=(f.ba-.5)*mix(.30,.34,off)+(gq.ba-.5)*.30*(1.-smoothstep(5.,22.,dist));
          vec2 w=vec2(.93,.37); vec2 sq=vec2(dot(q,w)*.06,dot(q,vec2(-w.y,w.x))*.31); vec4 sa=sfxT(sq); float sm=smoothstep(.42,.68,sfxT(q*.021+.6).r)*off; sl+=vec2(-w.y,w.x)*(sa.a-.5)*1.0*sm+w*(sa.b-.5)*.2*sm;   // wind-carved sastrugi
          sfxCav=(a.r*.35+b.r*.4+c.r*.25)*mix(.55,1.,off)+(f.r-.5)*.22+(sa.r-.5)*.35*sm;
          #else
          sfxCav=(a.r*.4+b.r*.35+c.r*.25)*mix(.55,1.,off);
          #endif
          float wear=smoothstep(.40,.62,a.g*.6+b.g*.4);
          #if !defined(SNOW_FREE) && SQ>0
          { float per=.21; float cyc=fwidth(u)/per; float fade=(1.-smoothstep(.07,.26,cyc))*onP*(1.-wear*.8)*(1.-sfxIce)*smoothstep(.5,.75,wn.y); sl.x+=cos(u*6.2831853/per)*.15*fade; sfxCav+=(sin(u*6.2831853/per))*.05*fade; }   // groomed corduroy, worn away in patches
          if(uDefZ.z>.5){ float inz=smoothstep(uDefZ.x,uDefZ.x+6.,vWP.z)*(1.-smoothstep(uDefZ.y-5.,uDefZ.y,vWP.z))*(1.-smoothstep(12.6,13.6,abs(u))); 
            if(inz>.001&&dist<48.){ vec2 t=vec2(u/28.+.5,vWP.z/80.); vec2 e=uDefT*1.1; vec4 d0=texture2D(uDef,t); vec2 l=texture2D(uDef,t-vec2(e.x,0.)).rg,r=texture2D(uDef,t+vec2(e.x,0.)).rg,n=texture2D(uDef,t-vec2(0.,e.y)).rg,s=texture2D(uDef,t+vec2(0.,e.y)).rg;
              float far=1.-smoothstep(16.,46.,dist); vec2 gd=vec2((r.y*.7-r.x)-(l.y*.7-l.x),(s.y*.7-s.x)-(n.y*.7-n.x))*vec2(1.,.6); sl-=gd*-1.55*inz*far; sfxTrk=d0.r*inz; sfxCav=mix(sfxCav,.22,sfxTrk*.8)+d0.g*.22*inz; } }
          #endif
          sl*=mix(1.,.12,sfxIce);
          vec3 nw=mix(vec3(wn.x-sl.x,wn.y,wn.z-sl.y),vec3(wn.x,wn.y-sl.x,wn.z-sl.y),stx); nw=normalize(nw); sfxN=nw; normal=normalize((viewMatrix*vec4(nw,0.)).xyz);
          vec3 powd=vec3(.885,.915,.965), pack=vec3(.80,.845,.925), icec=vec3(.34,.56,.78);
          vec3 alb=mix(powd,pack,onP*(.55+.45*wear)); alb*=.90+.16*sfxCav+.06*(a.g-.5); alb=mix(alb*vec3(.80,.87,1.),alb,smoothstep(.12,.52,sfxCav));       // blue light gathers in the hollows
          alb=mix(alb,vec3(.66,.74,.88),sfxTrk*.75);
          float rough=mix(.93,.66,onP*wear); rough=mix(rough,.5,sfxTrk*.7); rough-=.10*(b.g-.5);
          #ifndef SNOW_FREE
          { float stp=1.-wn.y; float rk=smoothstep(.40,.56,stp+(b.r-.5)*.34+(a.g-.5)*.22)*smoothstep(hw+6.,hw+13.,abs(u)); rk*=smoothstep(.44,.5,c.r*.4+b.g*.6)*.6+.4; sfxRock=rk;       // bare rock on the steep banks
            vec4 r1=sfxT(vec2(vWP.y*.31,vWP.z*.12)), r2=sfxT(vec2(vWP.x*.23,vWP.y*.4)); float rr=r1.r*.6+r2.g*.4; vec3 rc=mix(vec3(.075,.078,.10),vec3(.20,.19,.205),rr); rc*=.8+.4*smoothstep(.48,.52,fract(vWP.y*.35+r1.g*1.4)); alb=mix(alb,rc,rk); rough=mix(rough,.82,rk); nw=normalize(mix(nw,normalize(wn+vec3((r1.b-.5),(r2.a-.5)*.8,(r1.a-.5))*1.6),rk)); normal=normalize((viewMatrix*vec4(nw,0.)).xyz); sfxN=nw; }
          #endif
          if(sfxIce>.01){ vec3 V=normalize(cameraPosition-vWP); vec2 pq=q-V.xz/max(V.y,.25)*.10; vec4 i1=sfxT(q*.21),i2=sfxT(pq*.33+.2),i3=sfxT(pq*1.7);
            float cr=smoothstep(.045,.0,abs(i1.r-.5))*.7+smoothstep(.03,0.,abs(i2.g-.5))*.6; float bub=smoothstep(.70,.82,i3.g)*smoothstep(.5,.7,i2.r); vec3 ic=mix(vec3(.10,.26,.44),icec,i2.r*.8+.1)+vec3(.55,.68,.80)*cr*.45+vec3(.5,.62,.72)*bub*.4; float fr=smoothstep(.45,.75,sfxT(q*.6).r+sfxT(q*.09).g*.4-.25);   // frost that melts into the snow at the edge
            float k=sfxIce*(1.-fr*.55*(1.-sfxIce)); alb=mix(alb,ic,k); rough=mix(rough,.09+.22*fr+cr*.25,k); }
          diffuseColor.rgb=alb; roughnessFactor=clamp(rough,.06,1.); }`)
        .replace('#include <opaque_fragment>', `
        { vec3 V=normalize(cameraPosition-vWP); float dd=length(cameraPosition-vWP); float lum=dot(outgoingLight,vec3(.3333)); float sn=(1.-sfxIce)*(1.-sfxRock); float nv=clamp(dot(sfxN,V),0.,1.);
          float fwd=pow(clamp(dot(-V,uKeyD),0.,1.),3.); outgoingLight+=uKeyC*vec3(.50,.68,1.)*sn*(fwd*.07+.018)*(.45+sfxCav);                           // light that has travelled through the snow
          float wrap=clamp((dot(sfxN,uKeyD)+.45)/1.45,0.,1.); outgoingLight+=diffuseColor.rgb*uKeyC*vec3(.26,.40,.78)*wrap*wrap*.055*sn;
          outgoingLight+=uSkyC*pow(1.-nv,4.)*.16*sn;
          #if SQ>0
          if(dd<60.){ float fp=max(length(fwidth(sfxQ)),1e-4); float s=sfxSpark(sfxQ,sfxN,V,uKeyD,fp)*1.; vec3 sc=uKeyC*s*5.5;
            #if SQ>1
            for(int i=0;i<5;i++){ vec3 l=uLampP[i]-vWP; float d2=dot(l,l); if(d2<240.){ sc+=vec3(1.,.72,.40)*sfxSpark(sfxQ+3.1,sfxN,V,l/sqrt(d2),fp)*26./(1.+d2*.07); } }
            #endif
            outgoingLight+=sc*sn*(1.-sfxTrk*.6)*(.25+lum)*smoothstep(1.2,3.5,dd)*(1.-smoothstep(34.,60.,dd)); }
          #endif
          #if SQ>1
          if(sfxIce>.05){ vec3 vp=-vViewPosition; vec4 r=sfxSSR(vp,normal,fract(52.98*fract(dot(gl_FragCoord.xy,vec2(.0671,.00584))))); float F=.04+.96*pow(1.-nv,5.); outgoingLight=mix(outgoingLight,r.rgb,r.a*clamp(F*1.6+.12,0.,.85)*sfxIce); outgoingLight+=vec3(.05,.14,.24)*sfxIce*(1.-nv)*.5; }
          #endif
        }
        #include <opaque_fragment>`);
    };

    /* ---- stand-alone ice sheets (creek, patches, loop deck) ---- */
    SN.compileIce = (sh, deck) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP,vWN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN=mat3(modelMatrix)*objectNormal;').replace('#include <project_vertex>', '#include <project_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = `uniform sampler2D uNz; uniform vec3 uKeyC,uSkyC; varying vec3 vWP,vWN; ${NS.GLSL_SSR}
        float sfxK; vec3 sfxN;\n` + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn=normalize(vWN); sfxK=${deck ? 'smoothstep(.55,.75,min(diffuseColor.r,diffuseColor.g))*step(diffuseColor.r,diffuseColor.b+.02)' : '1.'}; vec3 V=normalize(cameraPosition-vWP); vec3 an=abs(wn); vec2 q=an.y>.5?vWP.xz:(an.x>an.z?vWP.zy:vWP.xy);
          vec2 pq=q-V.xz/max(V.y,.3)*.14; vec4 a=texture2D(uNz,q*.11),b=texture2D(uNz,pq*.27+.2),c=texture2D(uNz,pq*1.9),f=texture2D(uNz,q*.7);
          vec3 nw=normalize(wn+vec3((a.b-.5)*.16+(f.b-.5)*.10,0.,(a.a-.5)*.16+(f.a-.5)*.10)*sfxK); sfxN=nw; normal=normalize((viewMatrix*vec4(nw,0.)).xyz)*(dot(normal,normalize((viewMatrix*vec4(wn,0.)).xyz))<0.?-1.:1.);
          float cr=smoothstep(.04,0.,abs(a.r-.5))+smoothstep(.028,0.,abs(b.g-.5))*.8; float bub=smoothstep(.72,.84,c.g)*smoothstep(.48,.66,b.r); float fr=smoothstep(.56,.78,a.g*.6+f.r*.5);
          vec3 ic=mix(vec3(.07,.20,.36),vec3(.30,.54,.74),b.r)+vec3(.55,.66,.78)*cr*.42+vec3(.5,.6,.7)*bub*.45; ic=mix(ic,vec3(.84,.89,.95),fr*.8);
          diffuseColor.rgb=mix(diffuseColor.rgb,${deck ? 'mix(diffuseColor.rgb,ic,.55)' : 'ic'},sfxK); roughnessFactor=mix(roughnessFactor,.07+.30*fr+.2*clamp(cr,0.,1.),sfxK); metalnessFactor*=1.-sfxK; }`)
        .replace('#include <opaque_fragment>', `{ vec3 V=normalize(cameraPosition-vWP); float nv=clamp(abs(dot(sfxN,V)),0.,1.), F=.04+.96*pow(1.-nv,5.); vec4 r=sfxSSR(-vViewPosition,normal,fract(52.98*fract(dot(gl_FragCoord.xy,vec2(.0671,.00584))))); outgoingLight=mix(outgoingLight,r.rgb,r.a*clamp(F*1.7+.14,0.,.85)*sfxK); outgoingLight+=uSkyC*F*.25*sfxK; }
        #include <opaque_fragment>`);
    };

    /* ---- deformation map: path space (u, z), z wraps every 80 m so nothing has to scroll ---- */
    const D = SN.def = { rt: null, n: 0, lastHead: null, dirty: false, cap: 220 };
    const sc = new THREE.Scene(), cam = new THREE.Camera();
    const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const aA = new THREE.InstancedBufferAttribute(new Float32Array(D.cap * 4), 4), aB = new THREE.InstancedBufferAttribute(new Float32Array(D.cap * 4), 4); aA.setUsage(THREE.DynamicDrawUsage); aB.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aA', aA); geo.setAttribute('aB', aB); geo.instanceCount = 0;
    const stM = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, uniforms: {},
      vertexShader: `attribute vec4 aA,aB; varying vec2 vQ; varying vec4 vB; varying vec2 vS; void main(){ vQ=position.xy; vB=aB; vS=aA.zw; float c=cos(aB.x),s=sin(aB.x); vec2 p=position.xy*aA.zw; p=vec2(c*p.x+s*p.y,-s*p.x+c*p.y); gl_Position=vec4((aA.x+p.x)/14.,(aA.y+p.y)/40.-1.,0.,1.); }`,
      fragmentShader: `varying vec2 vQ; varying vec4 vB; varying vec2 vS; void main(){ float d,r; if(vB.z<.5){ float x=abs(vQ.x)*vS.x, hw=vS.x*.5; d=1.-smoothstep(hw*.55,hw,x); r=smoothstep(hw*.8,hw*1.15,x)*(1.-smoothstep(hw*1.15,vS.x,x)); } else { float l=length(vQ); d=1.-smoothstep(.30,.62,l); r=smoothstep(.5,.68,l)*(1.-smoothstep(.68,1.,l)); } gl_FragColor=vec4(d*vB.y,r*vB.w,0.,1.); }` });
    const st = new THREE.Mesh(geo, stM); st.frustumCulled = false; sc.add(st);
    const clM = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, blending: THREE.NoBlending, uniforms: { uY: { value: new THREE.Vector2(-1, 1) } }, vertexShader: 'uniform vec2 uY; void main(){ gl_Position=vec4(position.x,mix(uY.x,uY.y,position.y*.5+.5),0.,1.); }', fragmentShader: 'void main(){ gl_FragColor=vec4(0.); }' });
    const clS = new THREE.Scene(), cl = new THREE.Mesh(geo.clone(), clM); { const g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position); g.setIndex(geo.index); cl.geometry = g; } cl.frustumCulled = false; clS.add(cl);
    SN.configure = (on, s) => {
      SN.on = on; SN.q = s.snow; U.uPrevOn.value = on && s.refl > 1 ? 1 : 0;
      const want = on && s.deform && s.snow > 0 ? (s.deform > 1 ? 1024 : 512) : 0;
      if (D.rt && D.rt.width !== want) { D.rt.dispose(); D.rt = null; }
      if (want && !D.rt) { D.rt = new THREE.WebGLRenderTarget(want, want * 2, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapT: THREE.RepeatWrapping, wrapS: THREE.ClampToEdgeWrapping }); D.rt.texture.generateMipmaps = false; D.lastHead = null; U.uDefT.value.set(1 / want, 1 / (want * 2)); }
      U.uDef.value = D.rt ? D.rt.texture : null; U.uDefZ.value.z = D.rt ? 1 : 0; D.n = 0;
    };
    const put = (u, zm, hw, hl, rot, str, type, rim) => { if (D.n >= D.cap) return; const i = D.n++ * 4; aA.array[i] = u; aA.array[i + 1] = zm; aA.array[i + 2] = hw; aA.array[i + 3] = hl; aB.array[i] = rot; aB.array[i + 1] = str; aB.array[i + 2] = type; aB.array[i + 3] = rim; };
    D.stamp = (u, z, hw, hl, rot, str, type, rim = .6) => { if (!D.rt || Math.abs(u) > 13.5) return; let zm = ((z % 80) + 80) % 80; const e = hw + hl; put(u, zm, hw, hl, rot, str, type, rim); if (zm < e) put(u, zm + 80, hw, hl, rot, str, type, rim); else if (zm > 80 - e) put(u, zm - 80, hw, hl, rot, str, type, rim); };
    /* a runner groove from (u0,z0) to (u1,z1) */
    D.line = (u0, z0, u1, z1, w, str, rim = .5) => { const du = u1 - u0, dz = z1 - z0, l = Math.hypot(du, dz); if (l < .002 || l > 6) return; D.stamp((u0 + u1) / 2, (z0 + z1) / 2, w * 2, l / 2 + .06, Math.atan2(du, dz), str, 0, rim); };
    D.crater = (u, z, r, str = 1, rim = .9) => D.stamp(u, z, r, r, 0, str, 1, rim);
    D.flush = zP => {
      if (!D.rt) return; const head = zP - 62; U.uDefZ.value.x = head; U.uDefZ.value.y = zP + 16;
      const old = renderer.getRenderTarget(), ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(D.rt);
      if (D.lastHead === null || head > D.lastHead + 1 || D.lastHead - head > 70) { clM.uniforms.uY.value.set(-1, 1); renderer.render(clS, cam); D.lastHead = head; }
      else if (head < D.lastHead - .2) { const a = head - .4, b = D.lastHead; const ya = ((a % 80) + 80) % 80, len = b - a; for (const off of [0, -80]) { const y0 = ya + off, y1 = y0 + len; if (y1 <= 0 || y0 >= 80) continue; clM.uniforms.uY.value.set(Math.max(0, y0) / 40 - 1, Math.min(80, y1) / 40 - 1); renderer.render(clS, cam); } D.lastHead = head; }
      if (D.n) { geo.instanceCount = D.n; aA.needsUpdate = aB.needsUpdate = true; renderer.render(sc, cam); D.n = 0; }
      renderer.setRenderTarget(old); renderer.autoClear = ac;
    };
    D.reset = () => { D.lastHead = null; D.n = 0; };
    return SN;
  };
})();
