import { useRef } from 'react'
import { Paperclip } from 'lucide-react'

// 브랜드 톤의 파일 선택 컴포넌트 — 네이티브 <input type=file>의 못생긴 버튼을 대체.
// 숨긴 input을 커스텀 버튼으로 트리거하고, 선택된 파일명을 옆에 예쁘게 표시한다.
type Props = {
  onPick: (files: FileList | null) => void
  accept?: string
  multiple?: boolean
  /** 선택된 파일명(부모 제어). 없으면 '선택된 파일 없음' 표시. */
  fileName?: string
  buttonLabel?: string
  disabled?: boolean
  /** 다중 누적형(공지 첨부 등)처럼 선택 후 input 값을 비워 같은 파일 재선택 허용. */
  resetAfter?: boolean
}

export function FilePicker({
  onPick, accept, multiple, fileName, buttonLabel = '파일 선택', disabled, resetAfter,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={'filepick' + (disabled ? ' is-disabled' : '')}>
      <button
        type="button"
        className="filepick-btn"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        <Paperclip size={14} /> {buttonLabel}
      </button>
      <span className={'filepick-name' + (fileName ? '' : ' is-empty')}>
        {fileName || '선택된 파일 없음'}
      </span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => { onPick(e.target.files); if (resetAfter) e.target.value = '' }}
      />
    </div>
  )
}
