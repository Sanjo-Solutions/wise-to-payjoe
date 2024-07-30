import fs from 'node:fs'
import { parse } from 'csv-parse'
import { finished } from 'stream/promises'

const MAX_REFERENCE_LENGTH = 50
const NUMBER_OF_REFERENCE_FIELDS = 4

function convertWiseRecordToPayJoeRecord(record) {
  const references = generateReferences(
    record['Payment Reference'],
    record.Description
  )
  return {
    UniqueIdentifier: record['TransferWise ID'],
    TransaktionsID: record['TransferWise ID'],
    Buchungsdatum: toDate(record.Date).toISOString(),
    Valuatadatum: toDate(record.Date).toISOString(),
    BruttoBetrag: record.Amount,
    BruttoWaehrung: record.Currency,
    GebuehrBetrag: -record['Total fees'],
    GebuehrWaehrung: record.Currency,
    Referenz1: references[0],
    Referenz2: references[1],
    Referenz3: references[2],
    Referenz4: references[3],
    NameZahlender2: record['Payer Name'],
    Zahlungsstatus: 1,
  }
}

function generateReferences(paymentReference, description) {
  const paymentReferenceAdjusted = description
    ? paymentReference + ', '
    : paymentReference
  const references = splitToPartsOfLength(
    paymentReferenceAdjusted,
    MAX_REFERENCE_LENGTH
  )
    .concat(splitToPartsOfLength(description, MAX_REFERENCE_LENGTH))
    .slice(0, NUMBER_OF_REFERENCE_FIELDS)
  return references
}

function splitToPartsOfLength(value, length) {
  const parts = []
  let remainingValue = value
  while (remainingValue.length > length) {
    const part = remainingValue.substr(0, length)
    parts.push(part)
    remainingValue = remainingValue.substr(length)
  }
  if (remainingValue.length > 0) {
    parts.push(remainingValue)
  }
  return parts
}

function toDate(value) {
  const [day, month, year] = value.split('-')
  return new Date(`${year}-${month}-${day}`)
}

async function sendToPayJoe(data) {
  return await fetch('https://api.payjoe.de/zahlungsupload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

const records = []
const parser = fs
  .createReadStream('statement_26522757_EUR_2024-07-01_2024-07-29.csv')
  .pipe(
    parse({
      columns: true,
      cast: true,
    })
  )
parser.on('readable', function () {
  let record
  while ((record = parser.read()) !== null) {
    records.push(record)
  }
})
await finished(parser)

const data = {
  UserName: process.env.PAYJOE_USER_NAME,
  APIKey: process.env.PAYJOE_API_KEY,
  ZugangID: process.env.PAYJOE_ZUGANG_ID,
  Zahlungen: records.map(convertWiseRecordToPayJoeRecord),
}

try {
  const result = await sendToPayJoe(data)
  const body = await result.json()

  if (body && body.Erfolgreich) {
    process.exit(0)
  } else {
    console.error(body)
    process.exit(1)
  }
} catch (error) {
  console.error(error)
  process.exit(1)
}
