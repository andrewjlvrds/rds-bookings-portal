import { getAccessToken } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var module = req.query.module || 'Bookings';
    var token = await getAccessToken();
    var domain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
    var url = domain + '/crm/v7/settings/fields?module=' + module;

    var response = await fetch(url, {
      headers: { 'Authorization': 'Zoho-oauthtoken ' + token }
    });

    if (!response.ok) {
      // Try CustomModule4 if Bookings fails
      if (module === 'Bookings') {
        url = domain + '/crm/v7/settings/fields?module=CustomModule4';
        response = await fetch(url, {
          headers: { 'Authorization': 'Zoho-oauthtoken ' + token }
        });
      }
      if (!response.ok) {
        var errText = await response.text();
        return res.status(response.status).json({ error: errText });
      }
    }

    var data = await response.json();
    var fields = (data.fields || []).map(function(f) {
      return {
        api_name: f.api_name,
        display_label: f.display_label || f.field_label,
        data_type: f.data_type,
        pick_list_values: (f.pick_list_values || []).map(function(v) { return v.display_value }),
      };
    });

    // Sort by display label
    fields.sort(function(a, b) { return (a.display_label || '').localeCompare(b.display_label || ''); });

    res.status(200).json({
      module: module,
      total_fields: fields.length,
      fields: fields,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
