import { parentPort, workerData } from 'node:worker_threads'
import { initDatabase, closeDatabase } from '../../server/repositories/database.ts'
import { createJobService } from '../../server/services/jobs.ts'
initDatabase(workerData.dir)
parentPort.postMessage('ready')
Atomics.wait(new Int32Array(workerData.signal), 0, 0)
const job = createJobService().claim(workerData.owner)
parentPort.postMessage({ id: job?.id ?? null })
closeDatabase()
