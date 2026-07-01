import { eventHandler, readRawBody, createError } from 'vinxi/http'
import { createAuditForEmail } from '../../db/queries'

export default eventHandler(async (event) => {
  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  }

  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' })
  }

  let stripeEvent
  try {
    stripeEvent = JSON.parse(rawBody)
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  console.log('Received Stripe event:', stripeEvent.type)

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object
    const email = session.customer_details?.email || session.customer_email
    const amount = session.amount_total / 100 // Convert cents to dollars

    let auditType = "Custom Audit"
    if (amount === 2500) auditType = "Deep-Dive AI Opportunity Audit"
    else if (amount === 7500) auditType = "Starter Implementation"
    else if (amount === 15000) auditType = "Growth Implementation"
    else if (amount === 30000) auditType = "Scale Implementation"
    else if (amount === 750 || amount === 2000) auditType = "Monthly Operations"

    console.log(`Processing purchase for ${email}: ${auditType} ($${amount})`)

    if (email) {
      try {
        await createAuditForEmail({ data: { email, type: auditType } })
        console.log(`Successfully created audit for ${email}`)
      } catch (err) {
        console.error('Error creating audit for email:', err)
        // We still return 200 to Stripe to avoid retries if the error is internal
      }
    }
  }

  return { received: true }
})
