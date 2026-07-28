type ExportProgressProps = {
  open: boolean
  stage: string
  detail: string
  percent: number
}

export default function ExportProgress({ open, stage, detail, percent }: ExportProgressProps) {
  if (!open) return null
  return (
    <div className="export-overlay" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="export-progress">
        <span className="export-kicker">STL EXPORT</span>
        <h2 id="export-title">{stage}</h2>
        <div className="progress-track" aria-label="Export progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="progress-meta"><span>{detail}</span><b>{Math.round(percent)}%</b></div>
      </div>
    </div>
  )
}
