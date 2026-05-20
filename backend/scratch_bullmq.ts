import { DelayedError, Job } from 'bullmq';
console.log(Object.getOwnPropertyNames(DelayedError.prototype));
console.log(Object.getOwnPropertyNames(Job.prototype).filter(n => n.includes('Delay')));
