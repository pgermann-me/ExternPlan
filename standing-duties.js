export function validateStandingFunction(fn){
 if(fn.duty_time_model!=null&&!['scheduled','always'].includes(fn.duty_time_model))throw Error('Unbekannter Zeitbereich');
}
