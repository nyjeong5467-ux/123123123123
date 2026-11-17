// [175] 화면 일부가 그리는 중 오류로 멈출 때 앱 전체가 하얗게 되지 않게 막고, 오류 내용을 보여 준다.
import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; onClose?: () => void; title?: string }
type State = { err: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }
  static getDerivedStateFromError(err: Error): State { return { err } }
  componentDidCatch(err: Error) { console.error('[ErrorBoundary]', err) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="modal-backdrop" onClick={this.props.onClose}>
        <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-head"><h3>{this.props.title || '화면을 표시하지 못했습니다'}</h3></div>
          <div className="modal-body">
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>이 점검표 데이터를 그리는 중 오류가 났습니다. 아래 내용을 개발 담당자에게 전달해 주세요.</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, background: 'var(--card-2)', borderRadius: 10, padding: 10, maxHeight: 200, overflow: 'auto' }}>{String(this.state.err.message || this.state.err)}</pre>
          </div>
          <div className="modal-foot"><button className="btn btn-primary" onClick={this.props.onClose}>닫기</button></div>
        </div>
      </div>
    )
  }
}
