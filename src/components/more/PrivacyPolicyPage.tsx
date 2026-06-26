import BackButton from '../ui/BackButton'
import { C } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100%', background: C.bg, fontFamily: SAIRA }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px 20px 12px',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, background: C.bg, zIndex: 10,
      }}>
        <BackButton />
        <div style={{ fontSize: '16px', fontWeight: '900', color: C.text, fontFamily: SAIRA }}>プライバシーポリシー</div>
      </div>

      <div style={{ padding: '24px 20px', color: C.textSub, fontSize: '13px', lineHeight: 1.8, fontFamily: 'inherit' }}>
        <p style={{ color: C.textGhost, fontSize: '11px', marginBottom: '24px' }}>最終更新日：2026年6月13日</p>

        <Section title="1. 収集する情報">
          本アプリはユーザーの個人情報を収集しません。ゲームデータはすべてお使いの端末内（ローカルストレージ）にのみ保存されます。
        </Section>

        <Section title="2. データの保存場所">
          セーブデータはアプリをアンインストールすると削除されます。外部サーバーへの送信は行いません。
        </Section>

        <Section title="3. 広告">
          本アプリは広告を表示します。広告配信に際し、第三者の広告サービスが利用される場合があります。
        </Section>

        <Section title="4. 本ポリシーの変更">
          本ポリシーは予告なく変更される場合があります。変更後の内容はアプリ内に掲載します。
        </Section>

        <Section title="5. お問い合わせ">
          ご不明な点はアプリストアのサポートページよりお問い合わせください。
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '12px', fontWeight: '800', color: C.text, marginBottom: '6px', fontFamily: SAIRA }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}
