const UNSUPPORTED_SCHEMA_KEYS = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment', '$vocabulary',
  'definitions', 'propertyNames', 'additionalProperties', 'additionalItems',
  'unevaluatedProperties', 'unevaluatedItems', 'contentEncoding', 'contentMediaType',
  'contentSchema', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf', 'not',
  'minContains', 'maxContains', 'dependentRequired', 'dependentSchemas',
  'prefixItems', 'contains', 'patternProperties', 'const', 'deprecated',
  'minItems', 'maxItems', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'default', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'format', 'minProperties', 'maxProperties', 'uniqueItems',
  'readOnly', 'writeOnly', 'examples', 'title',
])

const VALID_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'])

export function inlineSchemaRefs(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema
  
  const defs = (schema.$defs ?? schema.definitions ?? {}) as Record<string, unknown>
  if (!defs || Object.keys(defs).length === 0) return schema

  const resolve = (node: unknown, seen: Set<string> = new Set()): unknown => {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(item => resolve(item, seen))
    
    const obj = node as Record<string, unknown>
    
    if ('$ref' in obj && typeof obj.$ref === 'string') {
      const ref = obj.$ref
      if (seen.has(ref)) {
        const result: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
          if (k !== '$ref') result[k] = resolve(v, seen)
        }
        return result
      }
      
      for (const prefix of ['#/$defs/', '#/definitions/']) {
        if (ref.startsWith(prefix)) {
          const name = ref.slice(prefix.length)
          if (name in defs) {
            const newSeen = new Set(seen)
            newSeen.add(ref)
            return resolve(JSON.parse(JSON.stringify(defs[name])), newSeen)
          }
        }
      }
      
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k !== '$ref') result[k] = resolve(v, seen)
      }
      return result
    }
    
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolve(v, seen)
    }
    return result
  }
  
  return resolve(schema) as Record<string, unknown>
}

export function cleanSchema(obj: unknown, depth = 0): unknown {
  if (depth > 20) return obj
  if (obj === null || obj === undefined) return undefined
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    const cleaned = obj.map(item => cleanSchema(item, depth + 1)).filter(x => x !== undefined)
    return cleaned.length > 0 ? cleaned : undefined
  }
  
  const input = obj as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if ('anyOf' in input && Array.isArray(input.anyOf) && input.anyOf.length > 0) {
    const firstOption = cleanSchema(input.anyOf[0], depth + 1)
    if (firstOption && typeof firstOption === 'object') {
      return firstOption
    }
  }

  if ('oneOf' in input && Array.isArray(input.oneOf) && input.oneOf.length > 0) {
    const firstOption = cleanSchema(input.oneOf[0], depth + 1)
    if (firstOption && typeof firstOption === 'object') {
      return firstOption
    }
  }

  if ('const' in input) {
    result.enum = [input.const]
  }
  
  for (const [key, value] of Object.entries(input)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue
    if (key === 'const') continue
    if (value === undefined || value === null) continue
    
    if (key === 'type') {
      if (typeof value === 'string' && VALID_TYPES.has(value)) {
        result[key] = value
      } else if (Array.isArray(value)) {
        const validTypes = value.filter(t => typeof t === 'string' && VALID_TYPES.has(t))
        if (validTypes.length === 1) {
          result[key] = validTypes[0]
        } else if (validTypes.length > 1) {
          result[key] = validTypes[0]
        }
      }
      continue
    }
    
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      const cleanedProps: Record<string, unknown> = {}
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        const cleanedProp = cleanSchema(propValue, depth + 1)
        if (cleanedProp && typeof cleanedProp === 'object' && Object.keys(cleanedProp as object).length > 0) {
          cleanedProps[propKey] = cleanedProp
        }
      }
      if (Object.keys(cleanedProps).length > 0) {
        result[key] = cleanedProps
      }
      continue
    }
    
    if (key === 'items') {
      const cleanedItems = cleanSchema(value, depth + 1)
      if (cleanedItems && typeof cleanedItems === 'object' && Object.keys(cleanedItems as object).length > 0) {
        result[key] = cleanedItems
      }
      continue
    }
    
    const cleaned = cleanSchema(value, depth + 1)
    if (cleaned !== undefined) {
      result[key] = cleaned
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined
}

export function ensureObjectSchema(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return { type: 'object', properties: {} }
  const inlined = inlineSchemaRefs(params)
  const cleaned = cleanSchema(inlined) as Record<string, unknown> | undefined
  if (!cleaned) return { type: 'object', properties: {} }
  if (cleaned.type === 'object') return cleaned
  return { type: 'object', ...cleaned }
}
