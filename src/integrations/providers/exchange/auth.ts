export { getOutlookOAuthConfig, buildOutlookAuthUrl, handleOutlookCallback, refreshOutlookToken, isOutlookTokenExpired as isExchangeTokenExpired } from "../outlook/auth";
export async function getExchangeEWSClient(config: { ewsUrl: string; username: string; password: string }): Promise<string> {
  const r = await fetch(`${config.ewsUrl.replace(/\/+$/, "")}/ews/exchange.asmx`, { method: "POST", headers: { "Content-Type": "text/xml" }, body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ResolveNames xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><UnresolvedEntry>${config.username}</UnresolvedEntry></ResolveNames></soap:Body></soap:Envelope>` });
  return r.headers.get("Set-Cookie") || "";
}