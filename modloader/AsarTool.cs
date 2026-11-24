// Minimal Electron asar reader/writer with integrity support, for No Asteroids mod installation.
// Compiled at runtime by Install-ModLoader.ps1 via Add-Type (.NET Framework, no external deps).
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace NAMods
{
    public static class Asar
    {
        const int BlockSize = 4 * 1024 * 1024;

        static JavaScriptSerializer Json()
        {
            return new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 1000 };
        }

        public static string Sha256Hex(byte[] data, int offset, int count)
        {
            using (var sha = SHA256.Create())
            {
                var h = sha.ComputeHash(data, offset, count);
                var sb = new StringBuilder(64);
                foreach (var b in h) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        public static string Sha256Hex(byte[] data) { return Sha256Hex(data, 0, data.Length); }

        /// Reads the raw header JSON string and the offset where file data begins.
        public static string ReadHeader(string asarPath, out long dataBase)
        {
            using (var fs = File.OpenRead(asarPath))
            using (var br = new BinaryReader(fs))
            {
                br.ReadUInt32();                  // pickle size (always 4)
                uint headerSize = br.ReadUInt32(); // size of the header pickle
                br.ReadUInt32();                  // header pickle payload size
                int strLen = br.ReadInt32();
                var json = Encoding.UTF8.GetString(br.ReadBytes(strLen));
                dataBase = 8 + (long)headerSize;
                return json;
            }
        }

        /// SHA-256 of the header JSON: the value Electron embeds in the exe.
        public static string HeaderHash(string asarPath)
        {
            long b;
            return Sha256Hex(Encoding.UTF8.GetBytes(ReadHeader(asarPath, out b)));
        }

        static Dictionary<string, object> FindNode(Dictionary<string, object> root, string entry, bool create)
        {
            var parts = entry.Trim('/').Split('/');
            var node = root;
            for (int i = 0; i < parts.Length; i++)
            {
                object filesObj;
                if (!node.TryGetValue("files", out filesObj))
                {
                    if (!create) return null;
                    filesObj = new Dictionary<string, object>();
                    node["files"] = filesObj;
                }
                var files = (Dictionary<string, object>)filesObj;
                object child;
                if (!files.TryGetValue(parts[i], out child))
                {
                    if (!create) return null;
                    child = new Dictionary<string, object>();
                    if (i < parts.Length - 1) ((Dictionary<string, object>)child)["files"] = new Dictionary<string, object>();
                    files[parts[i]] = child;
                }
                node = (Dictionary<string, object>)child;
            }
            return node;
        }

        /// Reads one packed file, e.g. "build/electron/main.cjs".
        public static byte[] ReadFile(string asarPath, string entry)
        {
            long dataBase;
            var header = Json().Deserialize<Dictionary<string, object>>(ReadHeader(asarPath, out dataBase));
            var node = FindNode(header, entry, false);
            if (node == null || !node.ContainsKey("offset")) throw new FileNotFoundException("Not in asar: " + entry);
            if (node.ContainsKey("unpacked") && (bool)node["unpacked"]) throw new InvalidOperationException("Entry is unpacked: " + entry);
            long offset = long.Parse((string)node["offset"]);
            int size = Convert.ToInt32(node["size"]);
            using (var fs = File.OpenRead(asarPath))
            {
                fs.Position = dataBase + offset;
                var buf = new byte[size];
                int read = 0;
                while (read < size) { int n = fs.Read(buf, read, size - read); if (n <= 0) throw new EndOfStreamException(); read += n; }
                return buf;
            }
        }

        public static bool HasEntry(string asarPath, string entry)
        {
            long b;
            var header = Json().Deserialize<Dictionary<string, object>>(ReadHeader(asarPath, out b));
            return FindNode(header, entry, false) != null;
        }

        static Dictionary<string, object> Integrity(byte[] data)
        {
            var blocks = new ArrayList();
            for (int off = 0; off < data.Length || (off == 0 && data.Length == 0); off += BlockSize)
            {
                int len = Math.Min(BlockSize, data.Length - off);
                blocks.Add(Sha256Hex(data, off, len));
                if (data.Length == 0) break;
            }
            return new Dictionary<string, object> {
                { "algorithm", "SHA256" },
                { "hash", Sha256Hex(data) },
                { "blockSize", BlockSize },
                { "blocks", blocks }
            };
        }

        /// Writes dst = src with the given entries replaced or added. Unchanged file data is copied
        /// verbatim; changed files are appended after it. Returns the new header hash.
        public static string Build(string srcAsar, string dstAsar, IDictionary changes)
        {
            long srcBase;
            var header = Json().Deserialize<Dictionary<string, object>>(ReadHeader(srcAsar, out srcBase));
            long srcDataLen = new FileInfo(srcAsar).Length - srcBase;

            var appended = new List<byte[]>();
            long next = srcDataLen;
            foreach (DictionaryEntry kv in changes)
            {
                var entry = (string)kv.Key;
                var data = (byte[])kv.Value;
                var node = FindNode(header, entry, true);
                node.Remove("unpacked");
                node.Remove("files");
                node["size"] = data.Length;
                node["offset"] = next.ToString();
                node["integrity"] = Integrity(data);
                appended.Add(data);
                next += data.Length;
            }

            var jsonBytes = Encoding.UTF8.GetBytes(Json().Serialize(header));
            int strLen = jsonBytes.Length;
            int padded = (strLen + 3) & ~3;
            uint payload = (uint)(4 + padded);
            uint headerSize = payload + 4;

            using (var src = File.OpenRead(srcAsar))
            using (var dst = File.Create(dstAsar))
            using (var bw = new BinaryWriter(dst))
            {
                bw.Write((uint)4);
                bw.Write(headerSize);
                bw.Write(payload);
                bw.Write(strLen);
                bw.Write(jsonBytes);
                for (int i = strLen; i < padded; i++) bw.Write((byte)0);
                bw.Flush();
                src.Position = srcBase;
                src.CopyTo(dst, 1 << 20);
                foreach (var d in appended) dst.Write(d, 0, d.Length);
            }
            return Sha256Hex(jsonBytes);
        }

        /// Copies exeIn to exeOut replacing the ASCII hex hash oldHex with newHex.
        /// Returns how many occurrences were found; writes nothing unless exactly one.
        public static int PatchExeHash(string exeIn, string exeOut, string oldHex, string newHex)
        {
            if (oldHex.Length != newHex.Length) throw new ArgumentException("hash lengths differ");
            var bytes = File.ReadAllBytes(exeIn);
            var needle = Encoding.ASCII.GetBytes(oldHex);
            var hits = new List<int>();
            for (int i = 0; i <= bytes.Length - needle.Length; i++)
            {
                if (bytes[i] != needle[0]) continue;
                int j = 1;
                while (j < needle.Length && bytes[i + j] == needle[j]) j++;
                if (j == needle.Length) hits.Add(i);
            }
            if (hits.Count == 1)
            {
                var repl = Encoding.ASCII.GetBytes(newHex);
                Buffer.BlockCopy(repl, 0, bytes, hits[0], repl.Length);
                File.WriteAllBytes(exeOut, bytes);
            }
            return hits.Count;
        }
    }
}
