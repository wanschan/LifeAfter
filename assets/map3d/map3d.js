/* ============================================================
   余烬纪 · 3D 旧大陆地图
   轻量 three.js 场景：位移地形 + 云层 + 悬浮地标
   ============================================================ */
(function () {
  'use strict';

  const TEX = window.MAP3D_TEX || {};
  const SIZE = 2400;          // 贴图覆盖的边长
  const PLATE = 1.0;          // 地形板比贴图大一圈：外圈用边缘像素延伸，避免看见矩形切口
  const SEG = 240;            // 细分（随 PLATE 一起放大，保持密度）
  const DISP = 118;           // 位移强度

  let renderer = null;
  let scene = null;
  let camera = null;
  let terrain = null;
  let raf = 0;
  let inited = false;
  let visible = false;
  let onPick = null;
  let wrapEl = null;
  let labelLayer = null;
  let markerData = [];
  let markerEls = [];
  let clouds = [];
  let scaleEl = null;
  let frameN = 0;
  const clock = { t: 0, last: 0 };

  const cam = { theta: -0.28, phi: 0.95, radius: 2700, tx: -160, ty: 40, tz: 180 };
  const goal = { theta: -0.28, phi: 0.95, radius: 2700, tx: -160, ty: 40, tz: 180 };
  let dragging = false;
  let dragMoved = false;
  let lastX = 0, lastY = 0;
  let pinned = null;

  /* ---------- 坐标换算 ---------- */
  /* PlaneGeometry 旋转后：u→x，图像上方(v=1)在远端(-z) */
  function uvToWorld(u, v) {
    return { x: (u - 0.5) * SIZE, z: (v - 0.5) * SIZE };
  }

  /* ---------- 初始化 ---------- */
  function init(container, markers, pickCb) {
    onPick = pickCb;
    wrapEl = container;
    markerData = markers || [];
    if (inited) { syncMarkers(); return Promise.resolve(); }
    inited = true;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b10);
    scene.fog = new THREE.Fog(0x070d13, 2350, 5200);

    camera = new THREE.PerspectiveCamera(38, 1, 10, 9000);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    wrapEl.appendChild(renderer.domElement);

    labelLayer = document.createElement('div');
    labelLayer.className = 'mk-layer';
    wrapEl.appendChild(labelLayer);

    scaleEl = document.querySelector('#ms-txt');

    buildTerrain();
    buildSea();
    buildLights();
    buildClouds();
    resize();
    bindInput();
    syncMarkers();
    loop();
    return Promise.resolve();
  }

  /* 边缘羽化：让地形板的四条硬边溶进海里，不露出矩形切口 */
  function edgeFadeTexture() {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    const bw = Math.round(s * 0.092);
    const bands = [
      [0, 0, 0, bw, 0, 0, s, bw],
      [0, s, 0, s - bw, 0, s - bw, s, bw],
      [0, 0, bw, 0, 0, 0, bw, s],
      [s, 0, s - bw, 0, s - bw, 0, bw, s]
    ];
    bands.forEach(b => {
      const grd = g.createLinearGradient(b[0], b[1], b[2], b[3]);
      grd.addColorStop(0, '#000000');
      grd.addColorStop(1, '#ffffff');
      g.fillStyle = grd;
      g.fillRect(b[4], b[5], b[6], b[7]);
    });
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function buildTerrain() {
    const span = SIZE * PLATE;
    const geo = new THREE.PlaneGeometry(span, span, SEG, SEG);
    geo.rotateX(-Math.PI / 2);

    // 贴图仍然只铺在中央 SIZE×SIZE 的范围，外圈靠 ClampToEdge 把边缘像素拉出去
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i,
        0.5 + (uvAttr.getX(i) - 0.5) * PLATE,
        0.5 + (uvAttr.getY(i) - 0.5) * PLATE);
    }
    uvAttr.needsUpdate = true;

    const loader = new THREE.TextureLoader();
    const colorTex = loader.load(TEX.color);
    colorTex.encoding = THREE.sRGBEncoding;
    colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const heightTex = loader.load(TEX.height);

    const mat = new THREE.MeshStandardMaterial({
      map: colorTex,
      displacementMap: heightTex,
      displacementScale: DISP,
      displacementBias: -18,
      roughness: 0.94,
      metalness: 0.02,
      alphaMap: edgeFadeTexture(),
      transparent: true,
      depthWrite: true
    });

    terrain = new THREE.Mesh(geo, mat);
    terrain.position.y = 0;
    scene.add(terrain);
  }

  function buildSea() {
    const g = new THREE.PlaneGeometry(SIZE * 10, SIZE * 10, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({
      color: 0x24485a,
      roughness: 0.62,
      metalness: 0.22
    });
    const sea = new THREE.Mesh(g, m);
    sea.position.y = -12;
    scene.add(sea);
  }

  function buildLights() {
    const sun = new THREE.DirectionalLight(0xffd6a2, 1.72);
    sun.position.set(-900, 1250, 620);
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x6fa0d0, 0.40);
    fill.position.set(800, 500, -700);
    scene.add(fill);

    scene.add(new THREE.HemisphereLight(0x86a2bc, 0x141a1e, 0.58));
  }

  function buildClouds() {
    const texs = (TEX.clouds || []).map(src => {
      const t = new THREE.TextureLoader().load(src);
      t.encoding = THREE.sRGBEncoding;
      return t;
    });
    if (!texs.length) return;

    for (let i = 0; i < 34; i++) {
      const tex = texs[i % texs.length];
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.05 + Math.random() * 0.13,
        depthWrite: false,
        color: 0xdfe8f0
      });
      const sp = new THREE.Sprite(mat);
      const s = 220 + Math.random() * 330;
      sp.scale.set(s, s * 0.72, 1);
      sp.position.set(
        (Math.random() - 0.5) * SIZE * 1.35,
        150 + Math.random() * 300,
        (Math.random() - 0.5) * SIZE * 1.35
      );
      sp.userData.speed = 3 + Math.random() * 9;
      sp.userData.baseY = sp.position.y;
      sp.userData.phase = Math.random() * Math.PI * 2;
      clouds.push(sp);
      scene.add(sp);
    }
  }

  /* ---------- 地标 ---------- */
  function syncMarkers() {
    if (!labelLayer) return;
    labelLayer.innerHTML = '';
    markerEls = [];

    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);

    markerData.forEach(m => {
      const p = uvToWorld(m.u, m.v);
      ray.set(new THREE.Vector3(p.x, 1400, p.z), down);
      const hit = terrain ? ray.intersectObject(terrain, false) : [];
      const y = hit.length ? hit[0].point.y : 40;

      const el = document.createElement('button');
      el.className = 'mk' + (m.open ? ' open' : '');
      el.dataset.id = m.id;
      el.innerHTML =
        `<span class="mk-tri"><svg viewBox="0 0 24 24"><path d="M12 2.5 L21.5 20 L2.5 20 Z"/></svg></span>
         <span class="mk-plate">
           <span class="mk-name">${m.name}</span>
           <span class="mk-en">${m.en || ''}</span>
         </span>`;
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (dragMoved) return;
        if (onPick) onPick(m.id);
      });
      labelLayer.appendChild(el);

      markerEls.push({ el: el, pos: new THREE.Vector3(p.x, y + 46, p.z), data: m });
    });
  }

  function updateMarkerScreen() {
    if (!camera || !labelLayer) return;
    const w = wrapEl.clientWidth;
    const h = wrapEl.clientHeight;
    const v = new THREE.Vector3();
    markerEls.forEach(o => {
      v.copy(o.pos).project(camera);
      const behind = v.z > 1;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      if (behind || sx < -120 || sx > w + 120 || sy < -60 || sy > h + 80) {
        o.el.style.opacity = '0';
        o.el.style.pointerEvents = 'none';
      } else {
        o.el.style.opacity = '1';
        o.el.style.pointerEvents = 'auto';
        o.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
      }
    });
  }

  /* ---------- 输入 ---------- */
  function bindInput() {
    const el = renderer.domElement;
    const THETA_MIN = -Math.PI, THETA_MAX = Math.PI;
    const PHI_MIN = 0.52, PHI_MAX = 1.26;

    el.addEventListener('pointerdown', e => {
      dragging = true; dragMoved = false;
      lastX = e.clientX; lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.classList.add('grabbing');
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      lastX = e.clientX; lastY = e.clientY;
      goal.theta = Math.max(THETA_MIN, Math.min(THETA_MAX, goal.theta - dx * 0.0042));
      goal.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, goal.phi - dy * 0.0032));
    });
    const endDrag = e => {
      const moved = dragMoved;
      dragging = false;
      el.classList.remove('grabbing');
      if (e && e.pointerId != null) { try { el.releasePointerCapture(e.pointerId); } catch (err) { } }
      setTimeout(() => { dragMoved = false; }, 60);
      if (!moved && onPick && e && e.type === 'pointerup') onPick(null);
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', () => { if (dragging) endDrag(); });

    el.addEventListener('wheel', e => {
      e.preventDefault();
      goal.radius = Math.max(620, Math.min(2600, goal.radius * (1 + Math.sign(e.deltaY) * 0.09)));
    }, { passive: false });

    // 触摸双指缩放
    let pinch = null;
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        goal.radius = Math.max(620, Math.min(2600, goal.radius * (pinch / Math.max(d, 1))));
        pinch = d;
      }
    }, { passive: true });
    el.addEventListener('touchend', () => { pinch = null; }, { passive: true });
  }

  /* ---------- 每帧 ---------- */
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!visible) return;

    const now = performance.now();
    const dt = clock.last ? Math.min((now - clock.last) / 1000, 0.1) : 0.016;
    clock.last = now;
    clock.t += dt;

    const k = 1 - Math.pow(0.0016, dt);
    cam.theta += (goal.theta - cam.theta) * k;
    cam.phi += (goal.phi - cam.phi) * k;
    cam.radius += (goal.radius - cam.radius) * k;
    cam.tx += (goal.tx - cam.tx) * k;
    cam.ty += (goal.ty - cam.ty) * k;
    cam.tz += (goal.tz - cam.tz) * k;

    const sp = Math.sin(cam.phi) * cam.radius;
    camera.position.set(
      cam.tx + sp * Math.sin(cam.theta),
      cam.ty + Math.cos(cam.phi) * cam.radius,
      cam.tz + sp * Math.cos(cam.theta)
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);

    clouds.forEach((sp2, i) => {
      sp2.position.x += sp2.userData.speed * dt;
      if (sp2.position.x > SIZE * 0.66) sp2.position.x = -SIZE * 0.66;
      sp2.position.y = sp2.userData.baseY + Math.sin(clock.t * 0.35 + sp2.userData.phase) * 12;
    });

    if (scaleEl && (frameN++ % 5) === 0) {
      const fov = camera.fov * Math.PI / 180;
      const viewH = 2 * cam.radius * Math.tan(fov / 2);
      const km = viewH * (92 / Math.max(1, wrapEl.clientHeight)) * 2.2;
      const v = km >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10;
      scaleEl.textContent = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' KM';
    }

    renderer.render(scene, camera);
    updateMarkerScreen();
  }

  /* ---------- 尺寸 ---------- */
  function aspect() {
    const w = (wrapEl && wrapEl.clientWidth) || window.innerWidth;
    const h = (wrapEl && wrapEl.clientHeight) || window.innerHeight;
    return w / h;
  }
  function baseRadius() {
    const a = aspect();
    if (a < 0.62) return 3300;
    if (a < 0.85) return 3400;
    if (a < 1.2) return 2950;
    return 2700;
  }
  function basePhi() {
    const a = aspect();
    if (a < 0.62) return 0.84;
    if (a < 0.85) return 0.84;
    if (a < 1.2) return 0.92;
    return 0.95;
  }
  function baseTx() {
    const a = aspect();
    if (a < 0.62) return -620;
    if (a < 0.85) return -460;
    if (a < 1.2) return -300;
    return -160;
  }
  function baseTz() {
    const a = aspect();
    if (a < 0.62) return -100;
    if (a < 0.85) return -60;
    if (a < 1.2) return 240;
    return 180;
  }

  function resize() {
    if (!renderer || !wrapEl) return;
    const w = wrapEl.clientWidth || window.innerWidth;
    const h = wrapEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 54 : 38;
    camera.updateProjectionMatrix();
    if (!pinned) {
      goal.radius = baseRadius(); goal.phi = basePhi();
      goal.tx = baseTx(); goal.tz = baseTz();
    }
  }

  /* ---------- 对外 ---------- */
  function focus(id, zoom) {
    const m = markerEls.find(o => o.data.id === id);
    if (!m) return;
    goal.tx = m.pos.x;
    goal.tz = m.pos.z;
    goal.ty = Math.max(m.pos.y * 0.55, 20);
    goal.radius = zoom || 940;
    goal.phi = 0.9;
    pinned = id;
    markerEls.forEach(o => o.el.classList.toggle('pinned', o.data.id === id));
  }

  function reset() {
    goal.theta = -0.28; goal.phi = basePhi(); goal.radius = baseRadius();
    goal.tx = baseTx(); goal.ty = 40; goal.tz = baseTz();
    pinned = null;
    markerEls.forEach(o => o.el.classList.remove('pinned'));
  }

  function highlight(id, on) {
    markerEls.forEach(function (o) {
      if (o.data.id !== id) return;
      o.el.classList.toggle('pinned', !!on);
    });
  }

  function show() {
    visible = true;
    clock.last = 0;
    if (renderer) resize();
  }
  function hide() { visible = false; }

  function destroy() {
    visible = false;
    if (raf) cancelAnimationFrame(raf);
  }

  function supported() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  window.Map3D = {
    init: init, focus: focus, reset: reset, highlight: highlight,
    show: show, hide: hide, resize: resize,
    destroy: destroy, supported: supported
  };
})();
