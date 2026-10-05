import { useRef } from 'react'
import { Dialog } from 'radix-ui'
import { VTA_LIMIT_MESSAGE } from './vtaAccess'

export function VtaLimitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const returnFocus = useRef<HTMLElement | null>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Overlay className="p-overlay" />
      <Dialog.Content
        className="p-dialog vta-limit-dialog"
        onOpenAutoFocus={event => {
          const target = document.activeElement
          const section = event.target instanceof HTMLElement ? event.target.closest('section') : null
          returnFocus.current = target instanceof HTMLElement && target !== document.body && !target.hasAttribute('disabled')
            ? target
            : section?.querySelector<HTMLInputElement>('input:not(:disabled)') ?? null
        }}
        onCloseAutoFocus={event => {
          event.preventDefault()
          returnFocus.current?.focus()
        }}
      >
        <div className="dialog-header">
          <Dialog.Title asChild><h3 className="dialog-title">VTA limit reached</h3></Dialog.Title>
        </div>
        <div className="dialog-body">
          <Dialog.Description asChild><p className="dialog-desc">{VTA_LIMIT_MESSAGE}</p></Dialog.Description>
        </div>
        <div className="dialog-footer">
          <Dialog.Close asChild><button className="btn btn-default">Got it</button></Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
