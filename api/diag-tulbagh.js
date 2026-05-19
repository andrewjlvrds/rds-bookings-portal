import { zohoApi } from './_zoho.js'
export default async function(req, res) {
  const result = await zohoApi('GET', 'Lodge_Bookings/search?criteria=(Name:contains:Tulbagh)&fields=id,Name,Booking_Notes,Day_Description,Check_in_Date,Status&per_page=5')
  res.status(200).json(result)
}
