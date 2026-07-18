import { describe, expect, it } from 'vitest'
import {
  defineSource,
  defineStatefulSource,
  dial,
  instantiate,
  registerSource,
  getSource,
  sourcesForType,
  clearRegistry,
  sampleSource,
} from '../src'

const add = defineSource({
  name: 'test.add',
  outType: 'number',
  params: {
    a: { type: 'number', slot: () => dial(0) },
    b: { type: 'number', slot: () => dial(0) },
  },
  body: ({ a, b }) => a + b,
})

const counter = defineStatefulSource({
  name: 'test.counter',
  outType: 'number',
  params: {
    step: { type: 'number', slot: () => dial(1) },
  },
  body: () => {
    let n = 0
    return ({ step }) => {
      n += step
      return n
    }
  },
})

describe('defineSource()', () => {
  it('produces a def with the supplied metadata', () => {
    expect(add.kind).toBe('sourceDef')
    expect(add.name).toBe('test.add')
    expect(add.outType).toBe('number')
    expect(add.stateful).toBe(false)
  })

  it('marks stateful defs', () => {
    expect(counter.stateful).toBe(true)
  })
})

describe('instantiate()', () => {
  it('builds a live source with fresh sub-slots', () => {
    const s = instantiate(add)
    expect(s.kind).toBe('source')
    expect(s.def).toBe(add)
    expect(s.params.a.kind).toBe('slot')
    expect(s.params.b.kind).toBe('slot')
    expect(s.params.a.dial.value).toBe(0)
  })

  it('gives each instance independent slots', () => {
    const a = instantiate(add)
    const b = instantiate(add)
    a.params.a.dial.value = 5
    expect(b.params.a.dial.value).toBe(0)
  })

  it('isolates stateful body closures per instance', () => {
    const c1 = instantiate(counter)
    const c2 = instantiate(counter)
    expect(sampleSource(c1, {})).toBe(1)
    expect(sampleSource(c1, {})).toBe(2)
    expect(sampleSource(c2, {})).toBe(1) // c2 not affected by c1
    expect(sampleSource(c1, {})).toBe(3)
  })

  it('shares stateless bodies across instances safely', () => {
    const a1 = instantiate(add)
    const a2 = instantiate(add)
    a1.params.a.dial.value = 3
    a1.params.b.dial.value = 4
    a2.params.a.dial.value = 10
    a2.params.b.dial.value = 20
    expect(sampleSource(a1, {})).toBe(7)
    expect(sampleSource(a2, {})).toBe(30)
  })
})

describe('registry', () => {
  it('registers and retrieves by name', () => {
    clearRegistry()
    registerSource(add)
    expect(getSource('test.add')).toBe(add)
  })

  it('returns undefined for unknown names', () => {
    clearRegistry()
    expect(getSource('nope')).toBeUndefined()
  })

  it('sourcesForType filters by outType', () => {
    clearRegistry()
    registerSource(add)
    const stringy = defineSource({
      name: 'test.s',
      outType: 'string',
      params: {},
      body: () => 'x',
    })
    registerSource(stringy)
    const nums = sourcesForType('number')
    expect(nums).toContain(add)
    expect(nums).not.toContain(stringy)
  })

  it('re-registering replaces (HMR-safe)', () => {
    clearRegistry()
    registerSource(add)
    const replacement = defineSource({
      name: 'test.add', // same name
      outType: 'number',
      params: {},
      body: () => 999,
    })
    registerSource(replacement)
    expect(getSource('test.add')).toBe(replacement)
  })
})
