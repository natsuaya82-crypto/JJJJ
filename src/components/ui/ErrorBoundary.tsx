import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { flushSaveNow } from '../../store/saveStorage'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import { APP_VERSION } from '../../data/appMeta'
import GlassButton from './GlassButton'


// アプリ全体のエラーバウンダリ。
// React は描画中の例外を受け止める境界が無いとルートごとアンマウントするため、
// 境界が1枚も無いと「画面が真っ白・タップは効くが何も出ない」状態になり、
// ユーザーはタスクキルするしかなくなる。そのタスクキルがセーブ書き込みの中断＝
// セーブ破損を招いていたので、まずここで受け止めて安全に立て直せるようにする。
type BoundaryState = { error: Error | null; componentStack: string }

export default class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] uncaught render error', error, info.componentStack)
    // ★どこで落ちたかは componentStack にしか無い。
    //   これをコンソールにだけ出していたので、実機から上がってくる報告は
    //   「TypeError: ○○」の一行だけになり、**原理的に場所が特定できなかった**。
    //   画面に出す文字は今までどおり短いまま、コピーする中身にだけ積む。
    this.setState({ componentStack: info.componentStack ?? '' })
    // 落ちた時点の状態そのものは正常なので、この場で安全に書き切っておく。
    // （ユーザーがタスクキルする前に確定させることで「白画面→キル→データ消失」を断つ）
    void flushSaveNow()
  }

  render() {
    const err = this.state.error
    if (!err) return this.props.children

    // 画面に出すのは1行だけ（枠の高さは変えない）。コピーする側にだけ場所の手がかりを積む
    const detail = `${err.name}: ${err.message}`
    const report = [
      `JPEL Manager ${APP_VERSION}`,
      detail,
      err.stack ?? '(stack なし)',
      this.state.componentStack ? `--- component stack ---${this.state.componentStack}` : '(component stack なし)',
    ].join('\n')
    return (
      <div style={{
        minHeight: '100dvh', color: C.text,
        fontFamily: "'Noto Sans JP', system-ui, sans-serif",
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))',
        textAlign: 'center', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, flexShrink: 0,
          background: alpha(C.gold, 0.12), border: `1.5px solid ${alpha(C.gold, 0.45)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 900, color: C.gold, fontFamily: SAIRA,
        }}>!</div>

        <div style={{ fontSize: F.title, fontWeight: 900 }}>エラーが発生しました</div>

        <div style={{ fontSize: F.body, color: C.textSub, lineHeight: 1.7, maxWidth: 320 }}>
          セーブデータはこの時点で保存済みです。<br />
          下のボタンから再読み込みすると、続きからプレイできます。
        </div>

        <div style={{
          maxWidth: 320, width: '100%', padding: '8px 10px',
          background: C.surface2, border: `1px solid ${C.border2}`,
          fontFamily: SAIRA, fontSize: F.caption, color: C.textDim,
          wordBreak: 'break-all', textAlign: 'left', maxHeight: 96, overflow: 'hidden',
        }}>
          {detail}
        </div>

        <GlassButton
          color={C.gold}
          style={{ marginTop: 4, padding: '13px 30px', fontSize: F.subLg }}
          onClick={() => { void flushSaveNow().finally(() => window.location.reload()) }}
        >
          アプリを再読み込み
        </GlassButton>

        <GlassButton
          color={C.textDim}
          size="sm"
          style={{ padding: '9px 18px' }}
          onClick={() => { void navigator.clipboard?.writeText(report).catch(() => {}) }}
        >
          エラー内容をコピー
        </GlassButton>

        <div style={{ fontSize: F.caption, color: C.textGhost, marginTop: 2 }}>
          何度も発生する場合は公式X（@JPEL_MANAGER）までご連絡ください
        </div>
      </div>
    )
  }
}
