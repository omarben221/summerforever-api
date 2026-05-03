// api/create-order.js
let cachedToken = null;
let tokenExpiry = null;

async function getShopifyToken() {
  // Vérifier si le token est encore valide (24h)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  
  console.log('🔄 Génération d\'un nouveau token Shopify...');
  
  const response = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Erreur génération token');
  }
  
  // Stocker le token (expire dans 24h)
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);
  
  console.log('✅ Token Shopify obtenu, expire dans 24h');
  return cachedToken;
}

export default async function handler(req, res) {
  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://summerforever.us');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { cart, customerInfo } = req.body;
    
    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Obtenir un token valide (auto-généré si expiré)
    const token = await getShopifyToken();
    
    const line_items = cart.map(item => ({
      title: `${item.name} - Taille: ${item.size}`,
      price: parseFloat(item.price.replace('MAD ', '')),
      quantity: item.quantity,
      requires_shipping: true,
      taxable: false
    }));
    
    const firstName = customerInfo.firstName || customerInfo.fullName.split(' ')[0];
    const lastName = customerInfo.lastName || customerInfo.fullName.split(' ').slice(1).join(' ') || '';
    
    const draftOrderData = {
      draft_order: {
        line_items: line_items,
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: `${customerInfo.phone.replace(/\D/g, '')}@summerforever.com`,
          phone: customerInfo.phone
        },
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: customerInfo.address,
          city: customerInfo.city,
          country: 'MA',
          phone: customerInfo.phone
        },
        tax_exempt: true
      }
    };
    
    const response = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify(draftOrderData)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.errors || 'Erreur Shopify');
    }
    
    const draftOrderId = data.draft_order.id;
    
    await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/draft_orders/${draftOrderId}/complete.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ payment_pending: true })
    });
    
    res.status(200).json({ 
      success: true, 
      orderId: draftOrderId,
      orderNumber: data.draft_order.order_number
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}
