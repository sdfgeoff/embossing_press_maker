type NumberFieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number | 'any'
  suffix?: string
  readOnly?: boolean
}

export default function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
  suffix = 'mm',
  readOnly = false,
}: NumberFieldProps) {
  const id = `field-${label.toLowerCase().replaceAll(' ', '-')}`
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="input-shell">
        <input
          id={id}
          name={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          readOnly={readOnly}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <b>{suffix}</b>
      </span>
    </label>
  )
}
