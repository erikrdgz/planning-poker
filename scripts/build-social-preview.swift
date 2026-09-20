// Run on macOS: swift scripts/build-social-preview.swift
import AppKit

let width = 1200, height = 630
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
let context = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.cgContext.translateBy(x: 0, y: CGFloat(height))
context.cgContext.scaleBy(x: 1, y: -1)
NSGraphicsContext.current = NSGraphicsContext(cgContext: context.cgContext, flipped: true)
func color(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
func box(_ rect: NSRect, _ fill: UInt32, radius: CGFloat = 0) {
    color(fill).setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}
func text(_ value: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ fill: UInt32, weight: NSFont.Weight = .regular) {
    (value as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color(fill)])
}
box(NSRect(x: 0, y: 0, width: width, height: height), 0xF6F7FC)
color(0xECEBFA).setFill()
NSBezierPath(ovalIn: NSRect(x: 660, y: 66, width: 530, height: 530)).fill()
box(NSRect(x: 64, y: 58, width: 46, height: 46), 0x7568DF, radius: 13)
text("✦", 72, 59, 32, 0xFFFFFF)
text("common ground", 124, 60, 30, 0x292D42, weight: .bold)
text("PLANNING POKER", 65, 160, 15, 0x777891, weight: .semibold)
text("Different perspectives.", 60, 204, 46, 0x292D42, weight: .bold)
text("Common ground.", 60, 263, 53, 0x7568DF, weight: .bold)
text("Pick a card. Reveal together.", 65, 352, 25, 0x686D82)
text("Make room for better conversations.", 65, 390, 25, 0x686D82)
box(NSRect(x: 64, y: 494, width: 232, height: 48), 0xE9E6FB, radius: 24)
text("A seat for every perspective", 81, 509, 15, 0x6156B9, weight: .medium)
func card(_ x: CGFloat, _ y: CGFloat, _ angle: CGFloat, _ fill: UInt32, _ ink: UInt32, _ label: String) {
    NSGraphicsContext.saveGraphicsState()
    let c = NSGraphicsContext.current!.cgContext
    c.translateBy(x: x, y: y)
    c.rotate(by: angle * .pi / 180)
    c.setShadow(offset: CGSize(width: 0, height: 12), blur: 25, color: color(0xCAC7E0).withAlphaComponent(0.45).cgColor)
    box(NSRect(x: -82, y: -122, width: 164, height: 244), fill, radius: 18)
    c.setShadow(offset: .zero, blur: 0, color: nil)
    color(0xDFDDEB).setStroke()
    NSBezierPath(roundedRect: NSRect(x: -82, y: -122, width: 164, height: 244), xRadius: 18, yRadius: 18).stroke()
    if label == "coffee" {
        color(ink).setStroke()
        let cup = NSBezierPath(roundedRect: NSRect(x: -30, y: -12, width: 54, height: 48), xRadius: 8, yRadius: 8)
        cup.lineWidth = 5; cup.stroke()
        let handle = NSBezierPath(ovalIn: NSRect(x: 24, y: -6, width: 22, height: 26))
        handle.lineWidth = 5; handle.stroke()
        for dx in [-18, 0, 18] {
            let steam = NSBezierPath(); steam.move(to: NSPoint(x: dx, y: -28)); steam.line(to: NSPoint(x: dx + 4, y: -42)); steam.lineWidth = 4; steam.stroke()
        }
        text("DISCUSS", -33, 79, 13, ink, weight: .medium)
    } else {
        text(label, -62, -103, 22, ink, weight: .medium)
        text(label, -26, -54, 82, ink, weight: .semibold)
        text(label, 48, 83, 22, ink, weight: .medium)
    }
    NSGraphicsContext.restoreGraphicsState()
}
card(809, 347, -20, 0xFFFFFF, 0x7568DF, "3")
card(1039, 353, 20, 0xFFF5E4, 0xAB8950, "coffee")
card(923, 325, 3, 0x8275E6, 0xFFFFFF, "5")
text("Independent thoughts. Shared understanding.", 738, 529, 16, 0x78758E)
NSGraphicsContext.restoreGraphicsState()
let png = bitmap.representation(using: .png, properties: [:])!
try png.write(to: URL(fileURLWithPath: "public/social-preview.png"))
