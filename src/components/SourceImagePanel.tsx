import { ImagePlus } from 'lucide-react'

type SourceImagePanelProps = {
  imageUrl: string
  fileName: string
  inverted: boolean
  onFile: (file?: File) => void
  onInvert: (inverted: boolean) => void
}

export default function SourceImagePanel({
  imageUrl,
  fileName,
  inverted,
  onFile,
  onInvert,
}: SourceImagePanelProps) {
  return (
    <div className="panel-section upload-section">
      <div className="section-heading"><span>01</span><h2>Source image</h2></div>
      <div className={`drop-zone ${imageUrl ? 'has-image' : ''}`}>
        <input
          id="heightmap-file"
          name="heightmap-file"
          type="file"
          accept="image/*"
          aria-label={imageUrl ? `Replace heightmap, currently ${fileName}` : 'Choose a heightmap'}
          onChange={(event) => onFile(event.target.files?.[0])}
        />
        <div className="drop-zone-content" aria-hidden="true">
          {imageUrl
            ? <><img src={imageUrl} alt="" /><span>{fileName}</span></>
            : <><ImagePlus size={26} /><strong>Choose a heightmap</strong><span>PNG, JPG or browser-supported image</span></>}
        </div>
      </div>
      <label className="toggle-row">
        <span><b>Reverse height</b><small>Swap light and dark elevation</small></span>
        <input name="reverse-height" type="checkbox" checked={inverted} onChange={(event) => onInvert(event.target.checked)} />
      </label>
    </div>
  )
}
