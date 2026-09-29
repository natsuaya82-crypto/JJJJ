// 3D中継の描画（three.js だけ。React も store も import しない）。
//
// ■何を描くか
//   位置は `engine/raceTimeline` の答え（スタートからのkm）をそのまま使う。**ここで位置を計算しない**
//   （棒グラフと同じ瞬間を映す。`RaceTrack` の `renderStage` から同じスナップショットが来る）。
//   ここで作るのは見た目だけ＝コースの道筋と起伏・道・並木・中継所の門・走者・カメラ。
//
// ■コースの形
//   道筋（左右のうねり）は決まった式、起伏は各区間の登り・下りの割合（`uphillPct` / `downhillPct`）から作る。
//   乱数は使わない（同じレースはいつ見ても同じ形）。
//
// ■重さ
//   道・地面・並木は追っている走者のまわり（後ろ150m〜前1200m）だけを作り、進んだら作り直す。
//   走者は近く（前後1.5km）だけ映す。走者の体は `assets/runner.glb`（Blender で作ったもの）。
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import runnerUrl from '../../../assets/runner.glb?url'

export type StageSegment = { distanceKm: number; uphillPct: number; downhillPct: number }
export type StageTeam = { teamId: string; color: string }
/** 1コマぶんの入力。km はスタートからの距離 */
export type StageFrame = {
  runners: readonly { teamId: string; raceKm: number; finished: boolean }[]
  focusTeamId: string | null
}
export type Stage = {
  setFrame(f: StageFrame): void
  resize(w: number, h: number): void
  dispose(): void
}

const SKY = 0xa9d3ee
const GRASS = 0x6f9a4a
const ROAD = 0x55585e
const LINE = 0xf2f2f2
const TREE = 0x3f6e36
const TRUNK = 0x6b4f33
const SKIN = 0x8a5a3c
const GATE = 0xf5c842

const STEP = 5            // 道の刻み（m）
const BEHIND = 150        // 追っている走者の後ろに作る長さ（m）
const AHEAD = 1200        // 前に作る長さ（m）
const ROAD_HALF = 4       // 道の半分の幅（m）
const GROUND_HALF = 260   // 地面の半分の幅（m）
const REBUILD = 25        // これだけ進んだら道を作り直す（m）
const VISIBLE_M = 1500    // 走者を映す範囲（前後 m）
const TREE_EVERY = 14     // 並木の間隔（m）
const GRADE = 0.06        // 登り100%のときの勾配

/** 道の中心の左右のうねり（m）。x はスタートからの m */
function centerZ(x: number): number {
  return 22 * Math.sin(x / 740) + 11 * Math.sin(x / 1930 + 1.3)
}

/** 起伏：区間ごとの登り・下りの割合から、10mごとの高さの表を作る */
function heightTable(segs: readonly StageSegment[]): { at: (x: number) => number; total: number } {
  const total = segs.reduce((a, s) => a + s.distanceKm * 1000, 0)
  const n = Math.max(2, Math.ceil(total / 10) + 2)
  const h = new Float32Array(n)
  let x = 0, y = 0, k = 0
  for (const s of segs) {
    const len = s.distanceKm * 1000
    const net = (s.uphillPct - s.downhillPct) / 100
    const rough = (s.uphillPct + s.downhillPct) / 100
    for (let d = 0; d < len && k < n; d += 10, x += 10) {
      h[k++] = y
      // 区間の平均の傾きに、起伏の多さぶんのうねりを足す
      const g = GRADE * net + GRADE * 0.5 * rough * Math.sin((x / 420) * Math.PI)
      y += g * 10
    }
  }
  for (; k < n; k++) h[k] = y
  return {
    total,
    at: (xm: number) => {
      const f = Math.max(0, Math.min(n - 1.001, xm / 10))
      const i = Math.floor(f)
      return h[i] + (h[i + 1] - h[i]) * (f - i)
    },
  }
}

/** 道の上の点。lat は道の中心からの横の位置（m） */
function roadPoint(x: number, lat: number, hAt: (x: number) => number, out = new THREE.Vector3()): THREE.Vector3 {
  const dz = (centerZ(x + 1) - centerZ(x - 1)) / 2
  const len = Math.hypot(1, dz)
  // 進む向きに直角な横向き
  return out.set(x - (dz / len) * lat, hAt(x), centerZ(x) + (1 / len) * lat)
}

function heading(x: number): number {
  return Math.atan2(centerZ(x + 1) - centerZ(x - 1), 2)
}

/** 決まった値のゆらぎ（乱数を使わない） */
function hash01(k: number): number {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 帯（道・白線・地面）の形。x の範囲を STEP で刻んで、中心から lat0〜lat1 の幅を張る */
function makeStrip(count: number, color: number): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3))
  const idx: number[] = []
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, c, b, b, c, d)
  }
  geo.setIndex(idx)
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }))
  mesh.frustumCulled = false
  return mesh
}

function fillStrip(mesh: THREE.Mesh, x0: number, lat0: number, lat1: number, lift: number, drop: number, hAt: (x: number) => number) {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const p = new THREE.Vector3()
  const count = pos.count / 2
  for (let i = 0; i < count; i++) {
    const x = x0 + i * STEP
    roadPoint(x, lat0, hAt, p); pos.setXYZ(i * 2, p.x, p.y + lift - (Math.abs(lat0) > ROAD_HALF * 2 ? drop : 0), p.z)
    roadPoint(x, lat1, hAt, p); pos.setXYZ(i * 2 + 1, p.x, p.y + lift - (Math.abs(lat1) > ROAD_HALF * 2 ? drop : 0), p.z)
  }
  pos.needsUpdate = true
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingSphere()
}

type Actor = {
  teamId: string
  holder: THREE.Group
  mixer: THREE.AnimationMixer
  lat: number
  x: number
  finished: boolean
  /** ゴールしたら消えていく（1→0）。体の材質の不透明度に当てる */
  fade: number
  mats: THREE.Material[]
}

/** ゴールした走者が消えるまでの秒（画面の秒） */
const FINISH_FADE_SEC = 1.2

/** 走者の頭の上の▼を置く所（canvas の左上からの px）。映っていなければ visible が false */
export type PlaceLabel = (teamId: string, x: number, y: number, visible: boolean) => void

/** ▼を出す範囲（追っている走者から前後 m） */
const LABEL_M = 400
/** ▼と頭のすき間（m）。高さは模型の背の高さから決める */
const LABEL_GAP = 0

/** 3D中継を canvas に作る。模型の読み込みが終わるまでは道だけ映る */
export function createStage(canvas: HTMLCanvasElement, segs: readonly StageSegment[], racers: readonly StageTeam[], onReady?: () => void, placeLabel?: PlaceLabel): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, 180, 1100)
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(-40, 80, 30)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000)
  const { at: hAt, total: totalM } = heightTable(segs)

  // 道と地面（追っている走者のまわりだけ）
  const count = Math.ceil((BEHIND + AHEAD) / STEP) + 1
  const ground = makeStrip(count, GRASS)
  const road = makeStrip(count, ROAD)
  const edgeL = makeStrip(count, LINE)
  const edgeR = makeStrip(count, LINE)
  scene.add(ground, road, edgeL, edgeR)

  // 並木（左右）
  const treeSlots = Math.ceil((BEHIND + AHEAD) / TREE_EVERY) * 2
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 6), new THREE.MeshLambertMaterial({ color: TRUNK }), treeSlots)
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5.5, 7), new THREE.MeshLambertMaterial({ color: TREE }), treeSlots)
  trunks.frustumCulled = false; crowns.frustumCulled = false
  scene.add(trunks, crowns)

  // 中継所の門（区間の頭ごと）
  const relayKm: number[] = []
  { let acc = 0; for (const s of segs) { acc += s.distanceKm; relayKm.push(acc) } }
  const gates = relayKm.map(km => {
    const g = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color: GATE })
    const postGeo = new THREE.BoxGeometry(0.35, 5, 0.35)
    const l = new THREE.Mesh(postGeo, mat); l.position.set(0, 2.5, -ROAD_HALF - 0.6)
    const r = new THREE.Mesh(postGeo, mat); r.position.set(0, 2.5, ROAD_HALF + 0.6)
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, ROAD_HALF * 2 + 1.6), mat); top.position.set(0, 5, 0)
    g.add(l, r, top)
    const x = km * 1000
    g.position.copy(roadPoint(x, 0, hAt))
    g.rotation.y = -heading(x)
    scene.add(g)
    return g
  })

  // 走者の足もとの影
  const shadows = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.34, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    Math.max(1, racers.length))
  shadows.frustumCulled = false
  scene.add(shadows)

  let builtAt = Number.NaN
  function rebuild(focusX: number) {
    const x0 = Math.max(-BEHIND, focusX - BEHIND)
    fillStrip(ground, x0, -GROUND_HALF, GROUND_HALF, -0.06, 3, hAt)
    fillStrip(road, x0, -ROAD_HALF, ROAD_HALF, 0, 0, hAt)
    fillStrip(edgeL, x0, -ROAD_HALF, -ROAD_HALF + 0.15, 0.01, 0, hAt)
    fillStrip(edgeR, x0, ROAD_HALF - 0.15, ROAD_HALF, 0.01, 0, hAt)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
    const k0 = Math.floor(x0 / TREE_EVERY)
    for (let i = 0; i < treeSlots; i++) {
      const k = k0 + (i >> 1)
      const side = i & 1 ? 1 : -1
      const x = k * TREE_EVERY + hash01(k * 2 + side) * 6
      const lat = side * (ROAD_HALF + 5 + hash01(k * 7 + side) * 30)
      roadPoint(x, lat, hAt, p)
      const sc = 0.8 + hash01(k * 13 + side) * 0.6
      s.set(sc, sc, sc)
      m.compose(p.clone().add(new THREE.Vector3(0, 1.1 * sc, 0)), q, s); trunks.setMatrixAt(i, m)
      m.compose(p.clone().add(new THREE.Vector3(0, 4.6 * sc, 0)), q, s); crowns.setMatrixAt(i, m)
    }
    trunks.instanceMatrix.needsUpdate = true
    crowns.instanceMatrix.needsUpdate = true
    builtAt = focusX
  }

  // 走者（模型が読めたら並べる）
  const actors = new Map<string, Actor>()
  let labelY = 2
  let disposed = false
  new GLTFLoader().load(runnerUrl, gltf => {
    if (disposed) return
    const clip = gltf.animations[0]
    gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name !== 'char1') o.visible = false })
    {
      const box = new THREE.Box3()
      gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o) })
      if (!box.isEmpty()) labelY = box.max.y + LABEL_GAP
    }
    racers.forEach((tm, i) => {
      const body = cloneSkinned(gltf.scene)
      const uniform = new THREE.Color(tm.color)
      const mats: THREE.Material[] = []
      body.traverse(o => {
        const mesh = o as THREE.SkinnedMesh
        if (!mesh.isMesh || !mesh.visible) return
        mesh.frustumCulled = false
        // 頂点の色は「ユニフォームの所（白）」と「体の所（黒）」の印。白をチームの色、黒を肌にする
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
        mat.onBeforeCompile = sh => {
          sh.uniforms.uUniform = { value: uniform }
          sh.uniforms.uSkin = { value: new THREE.Color(SKIN) }
          sh.fragmentShader = sh.fragmentShader
            .replace('void main() {', 'uniform vec3 uUniform;\nuniform vec3 uSkin;\nvoid main() {')
            .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(uSkin, uUniform, clamp(vColor.r, 0.0, 1.0));')
        }
        mesh.material = mat
        mats.push(mat)
      })
      const holder = new THREE.Group()
      holder.add(body)
      scene.add(holder)
      const mixer = new THREE.AnimationMixer(body)
      if (clip) {
        const act = mixer.clipAction(clip)
        act.time = hash01(i) * clip.duration
        act.play()
      }
      actors.set(tm.teamId, { teamId: tm.teamId, holder, mixer, lat: ((i % 5) - 2) * 0.9, x: 0, finished: false, fade: 1, mats })
    })
    onReady?.()
  })

  // カメラ（追っている走者の斜め後ろ）。走者にはぴったり付いて行き、なめらかにするのは
  // 追う相手を切り替えたときのずれだけ。位置そのものを追いかけさせると、再生中は走者が
  // 1秒に数百m進むので、カメラが道を作った範囲より後ろへ置いていかれる
  const camOff = new THREE.Vector3(), lookOff = new THREE.Vector3()
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3()
  let camInit = false
  let camFocus: string | null = null
  let frame: StageFrame = { runners: [], focusTeamId: null }
  let raf = 0
  let last = performance.now()

  function tick(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    const focus = frame.runners.find(r => r.teamId === frame.focusTeamId) ?? frame.runners[0]
    const fx = Math.min(totalM, (focus?.raceKm ?? 0) * 1000)
    if (!(Math.abs(fx - builtAt) < REBUILD)) rebuild(fx)
    for (const g of gates) g.visible = Math.abs(g.position.x - fx) < AHEAD

    const m = new THREE.Matrix4(), p = new THREE.Vector3()
    let si = 0
    for (const r of frame.runners) {
      const a = actors.get(r.teamId)
      if (!a) continue
      a.x = Math.min(totalM, r.raceKm * 1000)
      a.finished = r.finished
      // ゴールした走者は消えていく（オーナー・2026-09-29「走り終わったら選手フェードアウト」）
      const fade = r.finished ? Math.max(0, a.fade - dt / FINISH_FADE_SEC) : 1
      if (fade !== a.fade) {
        a.fade = fade
        for (const mt of a.mats) { mt.transparent = fade < 1; mt.opacity = fade }
      }
      const near = Math.abs(a.x - fx) < VISIBLE_M && fade > 0
      a.holder.visible = near
      if (!near) continue
      roadPoint(a.x, a.lat, hAt, a.holder.position)
      a.holder.rotation.y = -heading(a.x) + Math.PI / 2
      a.mixer.timeScale = a.finished ? 0 : 1
      a.mixer.update(dt)
      roadPoint(a.x, a.lat, hAt, p); p.y += 0.02
      m.makeRotationX(-Math.PI / 2).setPosition(p)
      shadows.setMatrixAt(si++, m)
    }
    shadows.count = si
    shadows.instanceMatrix.needsUpdate = true

    const lat = (focus && actors.get(focus.teamId)?.lat) ?? 0
    const want = roadPoint(fx - 4.5, lat * 0.85, hAt, new THREE.Vector3()); want.y += 2
    const look = roadPoint(fx + 7, lat * 0.9, hAt, new THREE.Vector3()); look.y += 1
    const focusId = focus?.teamId ?? null
    if (camInit && focusId !== camFocus) { camOff.subVectors(camPos, want); lookOff.subVectors(camLook, look) }
    camInit = true
    camFocus = focusId
    const k = Math.exp(-dt * 4)
    camOff.multiplyScalar(k); lookOff.multiplyScalar(k)
    // 切り替えのずれが大きい（遠くの走者へ移った）ときは、道の無い所を映さないよう跳ぶ
    if (camOff.length() > BEHIND * 0.5) { camOff.set(0, 0, 0); lookOff.set(0, 0, 0) }
    camPos.addVectors(want, camOff); camLook.addVectors(look, lookOff)
    camera.position.copy(camPos)
    camera.lookAt(camLook)

    renderer.render(scene, camera)

    // 頭の上の▼。描いたカメラで写した位置を渡すだけ（▼は画面の側で作る）
    if (placeLabel) {
      camera.updateMatrixWorld()
      const w = canvas.clientWidth, h = canvas.clientHeight
      for (const r of frame.runners) {
        const a = actors.get(r.teamId)
        const show = !!a && a.holder.visible && Math.abs(a.x - fx) < LABEL_M
        if (!a || !show) { placeLabel(r.teamId, 0, 0, false); continue }
        p.copy(a.holder.position); p.y += labelY
        p.project(camera)
        const inView = p.z < 1 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.1
        placeLabel(r.teamId, (p.x + 1) / 2 * w, (1 - p.y) / 2 * h, inView)
      }
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    setFrame(f) { frame = f },
    resize(w, h) {
      if (w <= 0 || h <= 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      scene.traverse(o => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose()
      })
      renderer.dispose()
    },
  }
}
