// api/create-order.js
export default async function handler(req, res) {
  // Configuration CORS - Version TRÈS permissive pour résoudre le problème
  const origin = req.headers.origin;
  
  // Autoriser spécifiquement summerforever.us
  if (origin === 'https://summerforever.us' || origin === 'https://www.summerforever.us') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Pour les tests, autoriser toutes les origines
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // En-têtes CORS essentiels
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // IMPORTANT: Répondre immédiatement aux requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Vérifier que c'est une requête POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { cart, customerInfo } = req.body;
    
    console.log('📦 Commande reçue');
    console.log('Cart:', cart?.length);
    console.log('Customer:', customerInfo?.fullName);
    
    // Validation
    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Vérifier le token Shopify
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!token) {
      console.error('❌ Token Shopify manquant!');
      return res.status(500).json({ error: 'Configuration error: Missing SHOPIFY_ACCESS_TOKEN' });
    }
    
    // Transformer le panier
    const line_items = cart.map(item => ({
      title: `${item.name} - Taille: ${item.size}`,
      price: parseFloat(item.price.replace('MAD ', '')),
      quantity: item.quantity,
      requires_shipping: true,
      taxable: false
    }));
    
    const total = line_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const firstName = customerInfo.firstName || customerInfo.fullName.split(' ')[0];
    const lastName = customerInfo.lastName || customerInfo.fullName.split(' ').slice(1).join(' ') || '';
    
    // Créer la commande Shopify
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
        note: `Commande SummerForever
Client: ${customerInfo.fullName}
Téléphone: ${customerInfo.phone}
Adresse: ${customerInfo.address}, ${customerInfo.city}

Produits:
${cart.map(item => `- ${item.name} (${item.size}) x${item.quantity} = ${item.price}`).join('\n')}

Total: ${total} MAD`,
        tags: 'summerforever-site',
        tax_exempt: true
      }
    };
    
    const response = await fetch(`https://tufjs6-cx.myshopify.com/admin/api/2024-01/draft_orders.json`, {
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
    
    // Compléter la commande
    const completeResponse = await fetch(`https://tufjs6-cx.myshopify.com/admin/api/2024-01/draft_orders/${draftOrderId}/complete.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ payment_pending: true })
    });
    
    const completeData = await completeResponse.json();
    
    console.log('✅ Commande créée!');
    
    res.status(200).json({
      success: true,
      orderId: draftOrderId,
      orderNumber: completeData.draft_order?.order_number || draftOrderId,
      message: 'Commande créée'
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
