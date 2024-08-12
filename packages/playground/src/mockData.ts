export const mockFullCart = {
  status: 'cart',
  items: [
    {
      product: {
        id: 123,
        color: 'blue',
        size: 'M',
        inventory: {
          stock: 5,
        },
      },
      productGroup: {
        name: 'T-shirt with a truck',
        categories: ['apparel', 'top'],
      },
      price: 25,
      quantity: 1,
    },
  ],
  tax: 0,
  subtotal: 25,
  total: 25,
}
