function validDate(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
}

export function validateOrderDueDates(voucher,field) {
  const header=voucher.header || voucher;
  const headerField=`${field}${voucher.header ? '.header' : ''}.order_due_date`;
  const errors=[];
  if(header.order_due_date!==undefined && !validDate(header.order_due_date)) errors.push({field:headerField,message:'Order due date must be a real YYYY-MM-DD date.'});
  const items=voucher.items || voucher.line_items || voucher.lineItems || header.items || [];
  if(!Array.isArray(items) || !items.length) return errors;
  items.forEach((item,index)=>{
    const value=item?.order_due_date ?? header.order_due_date;
    if(!validDate(value)) errors.push({field:item?.order_due_date!==undefined?`${field}.items[${index}].order_due_date`:headerField,message:'A valid order_due_date is required on the order or this item before importing to Tally.'});
  });
  return errors.filter((error,index)=>errors.findIndex(other=>other.field===error.field)===index);
}
