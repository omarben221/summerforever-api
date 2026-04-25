// api/create-order.js
export default async function handler(req, res) {
  // Configuration CORS - AUTORISE VOTRE DOMAINE
  const allowedOrigins = [
    'https://summerforever.us',
    'https://www.summerforever.us',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  
  const origin = req.headers.origin;
  
  // Vérifier si l'origine est autorisée
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // En développement, autoriser toute origine (optionnel)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // En-têtes CORS nécessaires
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 heures
  
  // Gérer la requête OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Vérifier que c'est une requête POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { cart, customerInfo } = req.body;
    
    console.log('📦 SummerForever - Nouvelle commande');
    console.log('Client:', customerInfo?.fullName);
    console.log('Articles:', cart?.length || 0);
    
    // Validation des données
    if (!cart || !cart.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    if (!customerInfo || !customerInfo.fullName || !customerInfo.phone) {
      return res.status(400).json({ error: 'Customer information missing' });
    }
    
    // Transformer le panier au format Shopify
    const line_items = cart.map(item => ({
      title: `${item.name} - Taille: ${item.size}`,
      price: parseFloat(item.price.replace('MAD ', '')),
      quantity: item.quantity,
      requires_shipping: true,
      taxable: false
    }));
    
    // Calculer le total
    const total = line_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Préparer les données pour Shopify
    const draftOrderData = {
      draft_order: {
        line_items: line_items,
        customer: {
          first_name: customerInfo.firstName || customerInfo.fullName.split(' ')[0],
          last_name: customerInfo.lastName || customerInfo.fullName.split(' ').slice(1).join(' ') || '',
          email: `${customerInfo.phone.replace(/\D/g, '')}@summerforever.com`,
          phone: customerInfo.phone
        },
        shipping_address: {
          first_name: customerInfo.firstName || customerInfo.fullName.split(' ')[0],
          last_name: customerInfo.lastName || customerInfo.fullName.split(' ').slice(1).join(' ') || '',
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
${cart.map(item => `- ${item.name} (Taille: ${item.size}) x${item.quantity} = ${item.price}`).join('\n')}

Total: ${total} MAD`,
        tags: 'summerforever-site, custom-order',
        tax_exempt: true
      }
    };
    
    // Vérifier que le token existe
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!token) {
      console.error('❌ SHOPIFY_ACCESS_TOKEN manquant!');
      return res.status(500).json({ error: 'Configuration error: Missing Shopify token' });
    }
    
    // Appel à l'API Shopify
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
      console.error('Erreur Shopify:', data);
      throw new Error(data.errors || 'Erreur création commande Shopify');
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
    
    if (!completeResponse.ok) {
      throw new Error('Erreur finalisation commande');
    }
    
    console.log('✅ Commande créée avec succès! ID:', draftOrderId);
    
    res.status(200).json({
      success: true,
      orderId: draftOrderId,
      orderNumber: completeData.draft_order.order_number || draftOrderId,
      message: 'Commande créée avec succès'
    });
    
  } catch (error) {
    console.error('❌ Erreur API:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
