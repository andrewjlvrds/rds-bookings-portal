var tokenCache = { access_token: null, expires_at: 0 };

export async function getAccessToken() {
  if (tokenCache.access_token && Date.now() < tokenCache.expires_at - 60000) {
    return tokenCache.access_token;
  }

  var url = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com') +
    '/oauth/v2/token';

  var params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN
  });

  var response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error('Zoho auth failed: ' + response.status + ' ' + errorText);
  }

  var data = await response.json();
  if (data.error) throw new Error('Zoho auth error: ' + data.error);

  tokenCache.access_token = data.access_token;
  tokenCache.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
  return data.access_token;
}

export async function zohoApi(method, path, body) {
  var token = await getAccessToken();
  var domain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  var url = domain + '/crm/v7/' + path;

  var options = {
    method: method,
    headers: {
      'Authorization': 'Zoho-oauthtoken ' + token,
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  var response = await fetch(url, options);

  // Retry once on rate limit (429 or LIMIT_EXCEEDED in 400)
  if (response.status === 429 || response.status === 400) {
    var peek = await response.text();
    if (response.status === 429 || peek.indexOf('LIMIT_EXCEEDED') > -1) {
      await new Promise(function(r) { setTimeout(r, 2000); });
      token = await getAccessToken();
      options.headers['Authorization'] = 'Zoho-oauthtoken ' + token;
      response = await fetch(url, options);
    } else {
      // Not a rate limit — throw original error
      throw new Error('Zoho API error: ' + response.status + ' ' + peek);
    }
  }

  // 204 = no content (empty results)
  if (response.status === 204) return { data: [] };

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error('Zoho API error: ' + response.status + ' ' + errorText);
  }

  var text = await response.text();
  return text ? JSON.parse(text) : { data: [] };
}

export async function zohoSearch(module, criteria, fields, perPage) {
  var token = await getAccessToken();
  var domain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  var url = domain + '/crm/v7/' + module + '/search?criteria=' + encodeURIComponent(criteria);
  if (fields) url += '&fields=' + fields;
  if (perPage) url += '&per_page=' + perPage;

  var response = await fetch(url, {
    headers: { 'Authorization': 'Zoho-oauthtoken ' + token }
  });

  if (response.status === 204) return { data: [] };

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error('Zoho search error: ' + response.status + ' ' + errorText);
  }

  return response.json();
}

export async function updateRecord(module, recordId, data) {
  return zohoApi('PUT', module + '/' + recordId, { data: [data] });
}
