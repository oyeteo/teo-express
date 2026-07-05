'use client'

import Image from 'next/image'

export default function Home() {
  return (
    <main className="transfer-page">
      <section className="transfer-shell" aria-labelledby="home-title">
        <header className="transfer-header">
          <div className="transfer-brand">
            <Image
              src="/teo-fm-lcd.png"
              alt="Teo"
              width={64}
              height={64}
              className="transfer-brand__mark"
              priority
            />
            <div>
              <div className="transfer-brand__name">TEO.EXPRESS</div>
              <div className="transfer-brand__meta">PRIVATE TRANSFER</div>
            </div>
          </div>
          <div className="transfer-status">STATUS: [ONLINE]</div>
        </header>
        <div className="transfer-panel">
          <div className="transfer-panel__topline">
            <span>Fast file delivery</span>
            <span>Links expire by default</span>
          </div>
          <h1 id="home-title" className="transfer-title">
            Send files. Open link. Done.
          </h1>
          <p className="transfer-copy">
            Teo Express is a private transfer desk for sending large files with clean branded recipient pages.
          </p>
        </div>
      </section>
    </main>
  )
}
