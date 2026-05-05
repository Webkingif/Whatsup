import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { authService } from '../services/auth';
import { 
  generateRSAKeyPair, 
  generateSalt, 
  deriveKeyFromPassword, 
  wrapPrivateKey, 
  exportPublicKey 
} from '../lib/crypto';
import { useAuthStore } from '../store/authStore';

export function Register() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const isGenerating = useAuthStore((state) => state.isGenerating);
  const setIsGenerating = useAuthStore((state) => state.setIsGenerating);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsGenerating(true);

    try {
      // 1. Generate RSA Key Pair
      const keypair = await generateRSAKeyPair();
      
      // 2. Generate PBKDF2 Salt
      const salt = generateSalt();

      // 3. Derive Key Wrap Key from password
      const kwk = await deriveKeyFromPassword(password, salt);

      // 4. Wrap Private Key
      const wrappedPrivateKey = await wrapPrivateKey(keypair.privateKey, kwk);

      // 5. Export Public Key
      const publicKeySpki = await exportPublicKey(keypair.publicKey);

      // 6. Register
      await authService.register({
        username: username.trim().toLowerCase(),
        display_name: displayName || username.trim(),
        password,
        public_key: publicKeySpki,
        wrapped_private_key: wrappedPrivateKey,
        pbkdf2_salt: salt,
      });

      // 7. Redirect to login
      navigate('/login', { state: { message: 'Registration successful! Please login.' } });

    } catch (err: any) {
      const message = err.response?.data?.detail 
        ? (Array.isArray(err.response.data.detail) ? err.response.data.detail[0].msg : err.response.data.detail)
        : (err.response?.data?.message || err.message || 'Registration failed');
      
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-75 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-8 flex flex-col items-center max-w-sm w-full mx-4 shadow-2xl">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Generating Secure Keys</h3>
            <p className="text-sm text-gray-500 text-center">
              We are generating your 2048-bit RSA keypair locally on your device. This ensures zero-knowledge end-to-end encryption.
            </p>
          </div>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Lock className="h-6 w-6 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Create an account</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleRegister}>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label 
                htmlFor="username" 
                className="block text-sm font-medium text-gray-700"
              >
                Username
              </label>
              <div className="mt-1">
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label 
                htmlFor="displayName" 
                className="block text-sm font-medium text-gray-700"
              >
                Display Name
              </label>
              <div className="mt-1">
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-md flex items-start space-x-3">
              <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <strong>End-to-End Encrypted.</strong> Your private key will be encrypted on your device and the server will never see your messages.
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isGenerating}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Register & Generate Keys
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
