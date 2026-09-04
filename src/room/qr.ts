import qrcode from 'qrcode-generator'

/**
 * A QR code as inline SVG, for the room's address on the narrator's phone.
 * The modules are drawn in Midnight on Ledger by the stylesheet, not by the
 * library's own black and white, so the palette holds.
 */
export const qrSvg = (text: string): string => {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}
