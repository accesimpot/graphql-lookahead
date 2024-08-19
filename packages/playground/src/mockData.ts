export const mockFullCart = {
  __typename: 'Order',
  status: 'cart',

  items: [
    {
      __typename: 'OrderItem',
      price: 25,
      quantity: 1,

      product: {
        __typename: 'Product',
        id: '123',
        color: 'blue',
        size: 'M',
        inventory: {
          __typename: 'Inventory',
          stock: 134,
        },
      },

      productGroup: {
        __typename: 'ProductGroup',
        name: 'T-shirt with a truck',
        categories: ['apparel', 'top'],
      },
    },
  ],

  tax: 0,
  subtotal: 25,
  total: 25,
}

export const mockPage = {
  __typename: 'Page',
  content: {
    __typename: 'ProductPageContent',
    products: [
      {
        __typename: 'Product',
        id: '34',
        color: 'blue',
        inventory: {
          __typename: 'Inventory',
          id: '4242',
          stock: 15,
        },
        size: 'M',
      },
      {
        __typename: 'Product',
        id: '36',
        color: 'blue',
        inventory: {
          __typename: 'Inventory',
          id: '4343',
          stock: 4,
        },
        size: 'M',
      },
    ],
  },
}
