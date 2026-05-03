export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  // Vercel injects :path* from the rewrite source into req.query.path
  const segments = Array.isArray(req.query.path)
    ? req.query.path
    : [req.query.path].filter(Boolean)
  const path = segments.join('/')

  // Remaining query params (exclude the injected 'path' key)
  const query = { ...req.query }
  delete query.path
  const qs = new URLSearchParams(query).toString()

  const targetUrl = `https://us.i.posthog.com/${path}${qs ? '?' + qs : ''}`

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)

  const headers = {}
  for (const h of ['content-type', 'content-encoding']) {
    if (req.headers[h]) headers[h] = req.headers[h]
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body.length > 0 ? body : undefined,
    })
    res.status(response.status)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (err) {
    res.status(502).end('Proxy error')
  }
}
