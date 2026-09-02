import { describe, expect, it } from 'vitest'
import { BRAND_SYMBOL_FLOOR, resolveBrandMark } from '../../components/ui/BrandLockup'

/**
 * BrandLockup's file-resolution table (Sign in handoff §2.3), as a pure
 * function. The rules it encodes are frozen logo rules: the 32px floor,
 * polarity, script, and — by omission — that the bilingual lockup is
 * unreachable from product code.
 */
describe('resolveBrandMark', () => {
  it('resolves the lockup files at and above the 32px floor', () => {
    expect(resolveBrandMark({ symbol: 64, script: 'en', polarity: 'light' }).src).toBe('/assets/logo/qist-lockup-en.svg')
    expect(resolveBrandMark({ symbol: 64, script: 'en', polarity: 'dark' }).src).toBe('/assets/logo/qist-lockup-en-ink.svg')
    expect(resolveBrandMark({ symbol: 64, script: 'ar', polarity: 'light' }).src).toBe('/assets/logo/qist-lockup-ar.svg')
    expect(resolveBrandMark({ symbol: 64, script: 'ar', polarity: 'dark' }).src).toBe('/assets/logo/qist-lockup-ar-ink.svg')
    expect(resolveBrandMark({ symbol: BRAND_SYMBOL_FLOOR }).kind).toBe('lockup')
  })

  it('resolves the symbol-only files below the floor, never the master light drawing', () => {
    const light = resolveBrandMark({ symbol: 24, polarity: 'light' })
    expect(light.src).toBe('/assets/logo/qist-symbol-small.svg')
    expect(light.kind).toBe('symbol')
    expect(light.pad).toBe(4) // symbol / 6
    // Flagged, not patched: no -ink small variant was shipped (handoff §9.3).
    expect(resolveBrandMark({ symbol: 24, polarity: 'dark' }).src).toBe('/assets/logo/qist-symbol-ink.svg')
  })

  it('derives lockup geometry from the symbol size and the artboard aspect', () => {
    const en64 = resolveBrandMark({ symbol: 64, script: 'en' })
    expect(en64.height).toBeCloseTo(64 * (160 / 120), 5)
    expect(en64.width).toBeCloseTo(en64.height * (353 / 160), 5)
    const ar32 = resolveBrandMark({ symbol: 32, script: 'ar' })
    expect(Math.round(ar32.width)).toBe(98)
    expect(Math.round(ar32.height)).toBe(43)
    expect(ar32.pad).toBe(0) // clear space is inside the lockup artboard
  })

  it('never resolves to the marketing-only bilingual lockup or a favicon', () => {
    for (const symbol of [16, 24, 31, 32, 64, 160]) {
      for (const script of ['en', 'ar'] as const) {
        for (const polarity of ['light', 'dark'] as const) {
          const { src } = resolveBrandMark({ symbol, script, polarity })
          expect(src).not.toContain('bilingual')
          expect(src).not.toContain('favicon')
        }
      }
    }
  })

  it('sets alt text in the matching script', () => {
    expect(resolveBrandMark({ script: 'en' }).alt).toBe('Qist')
    expect(resolveBrandMark({ script: 'ar' }).alt).toBe('قسط')
  })
})
