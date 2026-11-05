// The timber stock as something to look at: length bands, a filter and a short description of one piece.
export const LENGTH_BANDS = [{ id: 'all', label: 'All', min: 0, max: Infinity }, { id: 'short', label: 'Under 0.8 m', min: 0, max: 0.8 }, { id: 'mid', label: '0.8–1.2 m', min: 0.8, max: 1.2 }, { id: 'long', label: 'Over 1.2 m', min: 1.2, max: Infinity }];
export const nextBand = id => LENGTH_BANDS[(LENGTH_BANDS.findIndex(b => b.id === id) + 1) % LENGTH_BANDS.length];
export const inLength = (b, min, max) => b.length >= min && b.length < max;

export function lengthBins(beams, width = 0.1) {
  const lo = Math.floor(Math.min(...beams.map(b => b.length)) / width) * width, n = Math.ceil((Math.max(...beams.map(b => b.length)) - lo) / width + 1e-9), bins = Array.from({ length: n }, (_, i) => ({ min: lo + i * width, max: lo + (i + 1) * width, count: 0 }));
  for (const b of beams) bins[Math.min(n - 1, Math.floor((b.length - lo) / width))].count++;
  return bins;
}

// Opacity of one piece on the rack: the selected piece stays solid and everything else fades; pieces outside the filter nearly disappear.
export function pieceOpacity(b, min, max, selectedId) {
  if (selectedId) return b.id === selectedId ? 1 : inLength(b, min, max) ? 0.18 : 0.04;
  return inLength(b, min, max) ? 1 : 0.06;
}

export function pieceCard(b, jointList = []) {
  const with_ = [...new Set(jointList.map(j => j.with))];
  return { title: `${b.id} · module ${b.module}`, size: `${(b.length * 1000).toFixed(0)} mm long · ${(b.width * 1000).toFixed(0)} × ${(b.height * 1000).toFixed(0)} mm`, joints: jointList.length ? `${jointList.length} joints, with ${with_.join(', ')}` : 'No joints recorded', photo: `./data/photos/${encodeURIComponent(b.id)}.jpg`, noPhoto: 'No photo of this piece yet. Wood condition and defects are not recorded.',
    // Until a piece has its own photo, the card shows a site photo of the project's base beams. It is marked as a placeholder: it is not a photo of this piece.
    placeholder: { src: './data/photos/_placeholder_site_base_beams.jpg', alt: 'Placeholder: site photo of the base beams of the project', note: 'Placeholder image: project site photo (Gramazio Kohler Research, MIT licence), not a photo of this piece.' },
    // A slot for a 3D scan of the piece. Nothing is recorded until a file exists at this path.
    scan: { src: `./data/scans/${encodeURIComponent(b.id)}.glb`, note: `3D scan slot: no scan of ${b.id} recorded. Add data/scans/${b.id}.glb (metres).` } };
}
