import {AsyncLocalStorage} from 'node:async_hooks';
export const actorContext=new AsyncLocalStorage();
export const accessContext=new AsyncLocalStorage();
