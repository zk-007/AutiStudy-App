"use client";

/**
 * CameraConsentModal
 * ==================
 * A friendly, one-time popup that explains why AutiStudy wants to use
 * the student's camera and asks for permission.
 *
 * Shown ONCE — the first time a student opens a chat session after the
 * Teaching Agent feature was added. The choice is stored in localStorage
 * (key: "autistudy_camera_consent") so it never appears again.
 *
 * Designed to be calm, clear, and friendly for autistic students:
 *  - Simple language
 *  - Big clear buttons
 *  - Soft colors
 *  - No scary technical words
 */

import { motion, AnimatePresence } from "framer-motion";

interface CameraConsentModalProps {
  open: boolean;
  onAllow: () => void;
  onDecline: () => void;
}

export function CameraConsentModal({ open, onAllow, onDecline }: CameraConsentModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
          >
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
              {/* Animated camera icon */}
              <motion.div
                animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-6xl mb-4"
              >
                📷
              </motion.div>

              <h2 className="text-2xl font-extrabold text-gray-800 mb-3">
                Can I see your face? 😊
              </h2>

              <p className="text-gray-600 leading-relaxed mb-2 text-base">
                AutiStudy has a <strong>smart helper</strong> that watches your face
                while you learn.
              </p>

              <p className="text-gray-600 leading-relaxed mb-2 text-base">
                If you look <strong>confused 😕</strong>, it will automatically
                show you a picture or explain step-by-step — <em>without you
                having to ask!</em>
              </p>

              <p className="text-gray-600 leading-relaxed mb-6 text-base">
                If you look <strong>happy 😊</strong>, it knows you understand
                and keeps going normally.
              </p>

              {/* Privacy note */}
              <div className="bg-glacier-50 border border-glacier-200 rounded-2xl px-4 py-3 mb-6 text-sm text-glacier-800">
                🔒 <strong>Your camera stays private.</strong> No photos are saved.
                The camera only reads your expression, nothing else.
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onAllow}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-glacier-500 to-blue-500 text-white font-bold text-base shadow-md"
                >
                  Yes, turn on camera! 📷
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onDecline}
                  className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-base"
                >
                  No thanks
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
