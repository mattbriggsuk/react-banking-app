import { useEffect, useRef } from 'react'
import { formatNumber } from './validation'

interface RegistrationDialogProps {
  customerNumber: string
  pin: string
  onDismiss: () => void
}

export default function RegistrationDialog({ customerNumber, pin, onDismiss }: RegistrationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return <dialog ref={dialogRef} className="registration-dialog" aria-labelledby="registration-title" aria-describedby="registration-message" onClose={onDismiss} onCancel={event => { event.preventDefault(); onDismiss() }}>
    <h2 id="registration-title">Registration complete</h2>
    <p id="registration-message">Customer created. Keep your customer number and PIN for your next visit.</p>
    <dl className="registration-credentials">
      <div><dt>Customer number</dt><dd>{formatNumber(customerNumber)}</dd></div>
      <div><dt>PIN</dt><dd>{pin}</dd></div>
    </dl>
    <button className="button primary full-width" type="button" autoFocus onClick={onDismiss}>Got it</button>
  </dialog>
}
