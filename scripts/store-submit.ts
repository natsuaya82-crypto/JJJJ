// いまの版（`APP_VERSION`）を App Store の審査に出す。GitHub の Actions で押す（`.github/workflows/store-submit.yml`）。
//
//   node store-submit.cjs --build 185 --dry            # 何をするかを言うだけ（読むだけ・書かない）
//   node store-submit.cjs --build 185 --wait 90        # 版を作る → 最新情報 → 自動公開 → ビルドを待って付ける → 審査に出す
//
// ★やることは1本の流れで、途中で人が選ぶものは無い：
//   1. 版（`2.0.8` のような文字）が無ければ作る。公開中・審査中の版には触らない
//   2. 「最新情報」を入れる。**文は `src/data/appMeta.ts` の CHANGELOG の同じ版の本文**（`scripts/storeText`）
//   3. 審査に通ったら自動で公開する（`releaseType: AFTER_APPROVAL`。オーナー・2026-09-26「自動」）
//   4. ビルドの処理が終わるまで待って（`--wait` 分まで）、版に付ける
//   5. 審査に出す（開いている提出が既に Apple 側にあれば止める）
//
// ★文以外（説明文・キーワード・宣伝文・スクリーンショット）は触らない。新しい版を作ると
//   Apple が前の版から写すので、そのまま残る。
// ★日本語以外の locale が版にあったら止める。最新情報は locale ごとに要り、訳はこちらで作らない。
//
// 鍵は環境変数 ASC_ISSUER_ID / ASC_KEY_ID / ASC_PRIVATE_KEY（.p8 の中身、または base64）。
// Actions では `ios-deploy.yml` と同じ3つの Secrets。
import { createPrivateKey, createSign } from 'node:crypto'
import { storeTextProblems, storeVersion, whatsNewText } from './storeText'

const BUNDLE = 'com.tokinets.jpelmanager'   // capacitor.config の appId
const API = 'https://api.appstoreconnect.apple.com/v1'

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined }
const BUILD = arg('--build')
const WAIT_MIN = Number(arg('--wait') ?? 0)
const DRY = process.argv.includes('--dry')

function jwt(): string {
  const iss = process.env.ASC_ISSUER_ID, kid = process.env.ASC_KEY_ID, pem = process.env.ASC_PRIVATE_KEY
  if (!iss || !kid || !pem) throw new Error('ASC_ISSUER_ID / ASC_KEY_ID / ASC_PRIVATE_KEY が要ります')
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'ES256', kid, typ: 'JWT' })
  const body = b64({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })
  const key = createPrivateKey(pem.includes('BEGIN') ? pem : Buffer.from(pem, 'base64').toString('utf8'))
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' })
  return `${head}.${body}.${sig.toString('base64url')}`
}

type Doc = { data: any }   // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: string, url: string, body?: object): Promise<Doc> {
  // トークンは15分で切れるので、ビルドを待つあいだも呼ぶたびに作り直す
  const r = await fetch(url.startsWith('http') ? url : API + url, {
    method, headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status}\n${text.slice(0, 800)}`)
  return text ? JSON.parse(text) : { data: null }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!BUILD) throw new Error('--build が要ります（付けるビルド番号）')
  const VERSION = storeVersion()
  const text = whatsNewText()
  const bad = storeTextProblems(text)
  if (bad.length) throw new Error(`最新情報を Apple が断ります：${bad.join(' / ')}`)
  console.log(`版 ${VERSION} ・ビルド ${BUILD} ・最新情報 ${text.length} 文字${DRY ? ' （dry：書かない）' : ''}`)

  const app = (await call('GET', `/apps?filter[bundleId]=${BUNDLE}`)).data[0]
  if (!app) throw new Error(`bundle id ${BUNDLE} のアプリがありません`)
  console.log(`app ${app.id}  ${app.attributes.name}`)

  // 1. 版
  let ver = (await call('GET', `/apps/${app.id}/appStoreVersions?filter[versionString]=${VERSION}&filter[platform]=IOS`)).data[0]
  if (!ver) {
    if (DRY) console.log(`版 ${VERSION} はまだ無い → 作る`)
    else {
      ver = (await call('POST', '/appStoreVersions', { data: { type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: VERSION, releaseType: 'AFTER_APPROVAL' },
        relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data
      console.log(`版 ${VERSION} を作った (${ver.id})`)
    }
  }
  if (ver) {
    const state = ver.attributes.appStoreState ?? ver.attributes.appVersionState
    console.log(`版 ${VERSION} (${ver.id})  ${state}  releaseType ${ver.attributes.releaseType}`)
    if (!/PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|METADATA_REJECTED|INVALID_BINARY/.test(state))
      throw new Error(`版 ${VERSION} は ${state}。準備中の版にしか出せません`)
  }

  // 2. 最新情報（日本語のみ）
  const locs = ver ? (await call('GET', `/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data : []
  const others = locs.filter((l: any) => !String(l.attributes.locale).startsWith('ja'))   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (others.length) throw new Error(`日本語以外の locale があります（${others.map((l: any) => l.attributes.locale).join(', ')}）。最新情報の訳はこちらで作りません`)   // eslint-disable-line @typescript-eslint/no-explicit-any
  const ja = locs.find((l: any) => String(l.attributes.locale).startsWith('ja'))   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (ver && !ja) throw new Error('版に日本語の locale がありません')

  // 4. ビルド（処理が終わるまで待つ）
  const findBuild = async () => (await call('GET',
    `/builds?filter[app]=${app.id}&filter[version]=${BUILD}&filter[preReleaseVersion.version]=${VERSION}&limit=5`)).data[0]
  let build = await findBuild()
  for (let waited = 0; waited < WAIT_MIN && build?.attributes.processingState !== 'VALID'; waited++) {
    if (waited % 5 === 0) console.log(`ビルド ${BUILD} を待っています（${build?.attributes.processingState ?? 'まだ届いていない'}・${waited}分）`)
    await sleep(60_000)
    build = await findBuild()
  }
  if (!build) throw new Error(`ビルド ${BUILD}（${VERSION}）が App Store Connect にありません`)
  console.log(`ビルド ${BUILD} (${build.id})  ${build.attributes.processingState}  expired ${build.attributes.expired}`)
  if (build.attributes.processingState !== 'VALID') throw new Error(`ビルド ${BUILD} は ${build.attributes.processingState}。処理が終わってから出します`)

  // 5. 開いている提出（Apple 側にあるものがあれば止める。作りかけは使う）
  const open = (await call('GET', `/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES`)).data
  const sent = open.filter((s: any) => s.attributes.state !== 'READY_FOR_REVIEW')   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (sent.length) throw new Error(`審査の提出が既に Apple 側にあります（${sent.map((s: any) => s.attributes.state).join(', ')}）`)   // eslint-disable-line @typescript-eslint/no-explicit-any
  const draft = open.find((s: any) => s.attributes.state === 'READY_FOR_REVIEW')   // eslint-disable-line @typescript-eslint/no-explicit-any

  if (DRY) {
    console.log(`dry：最新情報を入れる → 自動公開にする → ビルド ${BUILD} を付ける → 審査に出す${draft ? `（作りかけの提出 ${draft.id} を使う）` : ''}`)
    return
  }

  await call('PATCH', `/appStoreVersionLocalizations/${ja.id}`,
    { data: { type: 'appStoreVersionLocalizations', id: ja.id, attributes: { whatsNew: text } } })
  console.log('最新情報を入れた')
  // 3. 審査に通ったら自動で公開
  await call('PATCH', `/appStoreVersions/${ver.id}`,
    { data: { type: 'appStoreVersions', id: ver.id, attributes: { releaseType: 'AFTER_APPROVAL' } } })
  console.log('審査に通ったら自動で公開')
  await call('PATCH', `/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: build.id } })
  console.log(`ビルド ${BUILD} を付けた`)

  const sub = draft ?? (await call('POST', '/reviewSubmissions', { data: { type: 'reviewSubmissions',
    attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data
  const items = (await call('GET', `/reviewSubmissions/${sub.id}/items`)).data
  if (!items.length)
    await call('POST', '/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems',
      relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
                       appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } })
  const done = (await call('PATCH', `/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id,
    attributes: { submitted: true } } })).data
  console.log(`審査に出した：${done.id}  ${done.attributes.state}`)
}

main().catch(e => { console.error(String(e?.message ?? e)); process.exit(1) })
