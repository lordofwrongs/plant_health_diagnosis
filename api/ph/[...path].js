export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  const originalPath = req.url.replace(/^\/api\/ph/, '')
  const targetUrl = `https://us.i.posthog.com${originalPath}`

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
    const data = await response.arrayBuffer()
    res.end(Buffer.from(data))
  } catch (err) {
    res.status(502).end('Proxy error: ' + err.message)
  }
}
