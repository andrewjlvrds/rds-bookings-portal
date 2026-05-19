import { zohoApi } from './_zoho.js'
export default async function(req, res) {
  const name = req.query.name || 'Bahnhof'
  const r = await zohoApi('GET', 'CustomModule5/search?criteria=(Name:contains:' + name + ')&fields=id,Name,Email,Preferred_Email,Email_Reservations_2&per_page=5')
  res.status(200).json(r?.data || [])
}
