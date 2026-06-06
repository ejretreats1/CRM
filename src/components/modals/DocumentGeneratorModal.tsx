import { useState } from 'react';
import { X, FileText, Loader, CheckCircle, FileSignature, ChevronRight } from 'lucide-react';
import type { Owner } from '../../types';
import type { OwnerDocument } from '../../services/ownerDocuments';
import DrivePickerModal from './DrivePickerModal';
import type { PickedDriveFile } from './DrivePickerModal';

interface DocumentGeneratorModalProps {
  owner: Owner;
  onGenerated: (doc: OwnerDocument) => void;
  onSendForSignature: (fileUrl: string, fileName: string) => void;
  onClose: () => void;
}

type Step = 'pick-template' | 'fill-fields' | 'generating' | 'done' | 'error';

export default function DocumentGeneratorModal({
  owner, onGenerated, onSendForSignature, onClose,
}: DocumentGeneratorModalProps) {
  const [step, setStep] = useState<Step>('pick-template');
  const [showDrivePicker, setShowDrivePicker] = useState(true);
  const [template, setTemplate] = useState<PickedDriveFile | null>(null);

  const firstProp = owner.properties[0];
  const [ownerName, setOwnerName] = useState(owner.name);
  const [ownerEmail, setOwnerEmail] = useState(owner.email ?? '');
  const [ownerPhone, setOwnerPhone] = useState(owner.phone ?? '');
  const [propertyAddress, setPropertyAddress] = useState(
    firstProp ? `${firstProp.address}, ${firstProp.city}, ${firstProp.state}`.replace(/, ,/g, ',').replace(/,\s*$/, '') : ''
  );
  const [commissionPct, setCommissionPct] = useState('');
  const [state, setState] = useState(firstProp?.state ?? '');
  const [documentName, setDocumentName] = useState(`${owner.name} - Management Agreement`);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState<OwnerDocument | null>(null);

  function handleTemplatePicked(files: PickedDriveFile[]) {
    setShowDrivePicker(false);
    const file = files[0];
    if (!file) return;
    setTemplate(file);
    setStep('fill-fields');
  }

  async function handleGenerate() {
    if (!template) return;
    setStep('generating');
    setErrorMsg('');
    try {
      const res = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateFileId: template.id,
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim(),
          ownerPhone: ownerPhone.trim(),
          propertyAddress: propertyAddress.trim(),
          commissionPct: commissionPct.trim(),
          state: state.trim(),
          ownerId: owner.id,
          documentName: documentName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate document');

      const doc: OwnerDocument = {
        id: data.id,
        ownerId: data.ownerId,
        name: data.name,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        fileSize: data.fileSize,
        storagePath: data.storagePath,
        uploadedAt: data.uploadedAt,
      };
      setGeneratedDoc(doc);
      onGenerated(doc);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed. Please try again.');
      setStep('error');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#4a90d9]" />
              <h3 className="font-bold text-white text-sm">Generate Contract</h3>
            </div>
            <button onClick={onClose} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="p-5">
            {/* Step: Fill fields */}
            {step === 'fill-fields' && template && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-[#162035] border border-[#1e3a5a] rounded-lg px-3 py-2">
                  <FileText size={13} className="text-[#4a90d9] flex-shrink-0" />
                  <p className="text-xs text-[#4a90d9] font-medium truncate">{template.name}</p>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Document name', value: documentName, set: setDocumentName, placeholder: 'Management Agreement' },
                    { label: 'Client name', value: ownerName, set: setOwnerName, placeholder: owner.name },
                    { label: 'Client email', value: ownerEmail, set: setOwnerEmail, placeholder: 'owner@email.com' },
                    { label: 'Client phone', value: ownerPhone, set: setOwnerPhone, placeholder: '555-123-4567' },
                    { label: 'Property address', value: propertyAddress, set: setPropertyAddress, placeholder: '123 Ocean Ave, Rehoboth Beach, DE' },
                    { label: 'Commission %', value: commissionPct, set: setCommissionPct, placeholder: '20' },
                    { label: 'Governing state', value: state, set: setState, placeholder: 'Delaware' },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-[#b8d4f0] mb-1">{label}</label>
                      <input
                        value={value}
                        onChange={e => set(e.target.value)}
                        placeholder={placeholder}
                        className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setStep('pick-template'); setShowDrivePicker(true); }}
                    className="flex-1 border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium py-2.5 rounded-lg hover:bg-[#1e2d45] transition-colors"
                  >
                    ← Change Template
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!ownerName.trim() || !commissionPct.trim()}
                    className="flex-1 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Generate PDF <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step: Generating */}
            {step === 'generating' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader size={28} className="text-[#6ab0f5] animate-spin" />
                <p className="text-sm font-medium text-[#b8d4f0]">Filling in contract…</p>
                <p className="text-xs text-[#3a5070] text-center">Claude is reading the template and inserting the details</p>
              </div>
            )}

            {/* Step: Done */}
            {step === 'done' && generatedDoc && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-12 h-12 rounded-full bg-[#0a2518] flex items-center justify-center">
                    <CheckCircle size={24} className="text-[#5ce0a0]" />
                  </div>
                  <p className="font-semibold text-white">Contract generated!</p>
                  <p className="text-xs text-[#b8d4f0] text-center">{generatedDoc.name} has been saved to this client's documents.</p>
                </div>

                <div className="flex gap-2">
                  <a
                    href={generatedDoc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium py-2.5 rounded-lg hover:bg-[#1e2d45] transition-colors text-center"
                  >
                    View PDF
                  </a>
                  <button
                    onClick={() => { onSendForSignature(generatedDoc.fileUrl, generatedDoc.name); onClose(); }}
                    className="flex-1 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <FileSignature size={14} /> Send for Signature
                  </button>
                </div>
              </div>
            )}

            {/* Step: Error */}
            {step === 'error' && (
              <div className="space-y-4">
                <p className="text-sm text-[#e05c5c] bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-3 py-2.5">{errorMsg}</p>
                <button
                  onClick={() => setStep('fill-fields')}
                  className="w-full border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium py-2.5 rounded-lg hover:bg-[#1e2d45] transition-colors"
                >
                  ← Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drive picker overlay */}
      {showDrivePicker && (
        <DrivePickerModal
          onSelect={handleTemplatePicked}
          onClose={onClose}
        />
      )}
    </>
  );
}
