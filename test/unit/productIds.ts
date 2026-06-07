/**
 * Unit tests for the Victron product-id lookup table (src/productIds.ts).
 *
 * The table is consulted by VEDirectParser.getProductLongname to turn a raw
 * PID into a human-readable model name, so the contract under test is: every
 * key is a 0x-prefixed hex id and every value is a non-empty model name.
 */
import { expect } from 'chai'
import { productIds } from '../../src/productIds'

describe('productIds lookup table', () => {
  it('maps representative product ids to their model names', () => {
    // One entry from each device family the plugin cares about.
    expect(productIds['0x204']).to.equal('BMV-702')
    expect(productIds['0xA053']).to.equal('SmartSolar MPPT 75/15')
    expect(productIds['0xA04C']).to.equal('BlueSolar MPPT 75/10')
    expect(productIds['0xA231']).to.equal('Phoenix Inverter 12V 250VA 230V')
    expect(productIds['0xA381']).to.equal('BMV-712 Smart')
  })

  it('uses 0x-prefixed hex keys mapped to non-empty names throughout', () => {
    const entries = Object.entries(productIds)
    expect(entries.length).to.be.greaterThan(0)
    for (const [key, name] of entries) {
      expect(key, `key ${key}`).to.match(/^0x[0-9A-Fa-f]+$/)
      expect(name, `name for ${key}`).to.be.a('string').and.not.equal('')
    }
  })
})
