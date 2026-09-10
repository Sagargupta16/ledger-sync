import './currencyAtmosphere.css'

const CURRENCY_MARKS = [
  { id: 'rupee-north', glyph: '₹' },
  { id: 'euro-east', glyph: '€' },
  { id: 'rupee-south', glyph: '₹' },
  { id: 'dollar-west', glyph: '$' },
  { id: 'rupee-east', glyph: '₹' },
  { id: 'pound-north', glyph: '£' },
  { id: 'rupee-west', glyph: '₹' },
]

export default function CurrencyAtmosphere() {
  return (
    <div className="currency-atmosphere" aria-hidden="true">
      {CURRENCY_MARKS.map(({ id, glyph }) => (
        <span
          key={id}
          className={`currency-atmosphere__mark currency-atmosphere__mark--${id}`}
        >
          {glyph}
        </span>
      ))}
    </div>
  )
}
