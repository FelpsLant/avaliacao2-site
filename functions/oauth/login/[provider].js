export async function onRequestGet(context) {
  const { env } = context;

  return new Response(
    "Chaves disponíveis em env: " + JSON.stringify(Object.keys(env || {})) +
      "\nTipo de env.DB: " + typeof (env && env.DB),
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
