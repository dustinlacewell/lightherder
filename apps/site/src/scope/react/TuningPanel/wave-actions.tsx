export function WaveActions({
  canRemove, onDuplicate, onRandomize, onRemove,
}: {
  canRemove: boolean
  onDuplicate: () => void
  onRandomize: () => void
  onRemove: () => void
}) {
  return (
    <div className="hero-actions">
      <button type="button" onClick={onDuplicate}>duplicate</button>
      <button type="button" onClick={onRandomize}>randomize</button>
      <button type="button" onClick={onRemove} disabled={!canRemove}>remove</button>
    </div>
  )
}
