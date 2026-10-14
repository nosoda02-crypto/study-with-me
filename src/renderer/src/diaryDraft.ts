let saveDraft: () => Promise<void> = async () => {}
export function registerDiaryDraft(save: () => Promise<void>): () => void {
  saveDraft = save
  return () => { if (saveDraft === save) saveDraft = async () => {} }
}
export function flushDiaryDraft(): Promise<void> { return saveDraft() }
