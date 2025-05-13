import { v4 as uuidv4 } from 'uuid'

function replaceUUIDv4Placeholders(obj: any): any {
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key] === 'UUIDv4') {
        obj[key] = uuidv4()
      } else if (typeof obj[key] === 'object') {
        replaceUUIDv4Placeholders(obj[key])
      }
    }
  }
  return obj
}

export { replaceUUIDv4Placeholders }
