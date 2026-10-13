export function detectOfferFields(text: string): {company?:string;title?:string}
export function fillEmptyOfferFields<T extends {company:string;title:string;text:string}>(draft:T,text:string,protectedFields?:string[]): {draft:T;proposals:{company?:string;title?:string}}
