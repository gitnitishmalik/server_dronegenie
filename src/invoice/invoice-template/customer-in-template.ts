export function generateCustomerHTMLTemplate(data: any, order: any): string {
  return `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
    body {
      font-family: 'Roboto', sans-serif;
    }
  </style>
</head>
<body class="p-8 bg-white text-sm text-gray-800">
  <div class="max-w-3xl mx-auto border p-6 shadow-sm">
    <!-- Header -->
    <div class="flex justify-between items-start mb-8">
      <div>
        <h1 class="text-3xl font-bold uppercase text-gray-800 mb-1">Invoice</h1>
        <p class="font-semibold">DRONEGENIE PVT LTD</p>
        <p>L20, Basement, Green park main, New Delhi 110016</p>
        <p>GSTIN: 07AAQFD3487J1ZV</p>
        <p class="mt-2 leading-6">
          T: +91 98119 07214<br>
          E: info@dronegenie.com<br>
          W: www.dronegenie.com
        </p>
      </div>
      <div class="text-right">
        <img src="https://dronegenie.in/server/uploads/7a8fc74d-dca4-40c2-ad1d-89122d87b4da-dronegenie.png" class="h-16 mb-2" alt="Logo">
        <p class="font-semibold">ISSUE DATE</p>
        <p${data.issueDate}</p>
        <p class="font-semibold mt-4">PLACE OF SUPPLY</p>
        <p>${data.placeOfSupply}</p>
      </div>
    </div>

    <!-- Billing Info -->
    <div class="flex border-t border-b py-4 mb-6">
      <div class="w-1/2 pr-4">
        <p class="font-semibold">INVOICE NO: ${data.invoiceNumber}</p>
        <p class="font-semibold mt-2">Bill to:</p>
        <p class="text-lg font-medium">${data.customer.name}</p>
        <p class="mt-1">GST No: ${data.customer.gstin}</p>
      </div>
      <div class="w-0.5 bg-green-500 mx-4"></div>
      <div class="w-1/2 pl-4 text-left bg-gray-100 p-2">
        <p class="font-semibold">Billing Address</p>
        <p>${data.customer.address}</p>
        <p>${data.customer.phone}</p>
      </div>
    </div>

    <!-- Table -->
    <table class="w-full text-left mb-6">
      <thead class="bg-gray-800 text-white">
        <tr>
          <th class="py-2 px-3">Product</th>
          <th class="py-2 px-3">Price</th>
          <th class="py-2 px-3">Total</th>
        </tr>
      </thead>
      <tbody>
        ${data.items?.map((item: any, idx: number) => {
    return `<tr key=${idx} class="bg-gray-100 border-b">
                <td class="py-2 px-3">
                <p>${item.name}</p>
                </td>
                <td class="py-2 px-3">₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="py-2 px-3">₹${item.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>`
  })
    }
      </tbody>
    </table>

    <div class="h-1 w-full bg-green-500 mb-4"></div>
    <div class="flex justify-between mb-6">
        <div class="text-left">
          <p class="font-semibold mb-1">Payment Method:</p>
          <p>Bank Transfer: Dronegenie Pvt Ltd</p>
          <p>Bank and Address: HDFC bank, green park extension, New Delhi, India.</p>
          <p>Account Number: 50205045842207</p>
          <p>IFSC: HDFC0000566</p>
        </div>
        <div class="text-right mb-4 w-[30%]">
          <p class="flex justify-between"><span class="font-semibold">Subtotal</span><span>₹${data.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> </p>
          <p class="flex justify-between"><span class="font-semibold">Tax Rate(${data.gst}%)</span><span>₹${data.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> </p>
          <p class="bg-black text-white p-1 flex justify-between">
            <span>Grand Total</span><span>₹${data.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> 
          </p>
        </div>
    </div>
    <div class="text-sm mb-10">
      <p class="font-semibold mb-1">Terms & Conditions:</p>
      <p>Your first conditions text can place here. There is your second<br>
        conditions text can place here. Your first conditions<br>
        text can place here.</p>
    </div>
    <div class="text-right mt-8">
      <p class="font-semibold  border-black pt-1">Authorised Signatory</p>
      <p class="text-sm text-gray-600 mr-20">Director</p>
    </div>
  </div>
</body>
</html>
    `;
}