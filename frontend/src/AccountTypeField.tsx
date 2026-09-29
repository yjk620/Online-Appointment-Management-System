import './AccountTypeField.css'

export type AccountType = 'client' | 'provider'

export default function AccountTypeField({ value, onChange }: { value: AccountType; onChange: (value: AccountType) => void }) {
  return <fieldset className="account-type">
    <legend>Account type</legend>
    <label><input type="radio" name="account_type" value="client" checked={value === 'client'} onChange={() => onChange('client')} />
      <span>Client: book appointments</span></label>
    <label><input type="radio" name="account_type" value="provider" checked={value === 'provider'} onChange={() => onChange('provider')} />
      <span>Provider: offer appointments (an admin approves new providers)</span></label>
  </fieldset>
}
