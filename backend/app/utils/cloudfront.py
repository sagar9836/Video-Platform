from datetime import datetime, timedelta
from botocore.signers import CloudFrontSigner
import rsa
from app.core.config import settings


def _rsa_signer(message):
    with open(settings.cloudfront_private_key_path, "rb") as f:
        private_key = rsa.PrivateKey.load_pkcs1(f.read())
    return rsa.sign(message, private_key, "SHA-1")


def generate_signed_hls_url(path: str, expires_in=300):
    signer = CloudFrontSigner(
        settings.cloudfront_key_pair_id,
        _rsa_signer,
    )

    url = f"https://{settings.cloudfront_domain}/{path}"

    return signer.generate_presigned_url(
        url,
        date_less_than=datetime.utcnow() + timedelta(seconds=expires_in),
    )
